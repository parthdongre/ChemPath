#!/usr/bin/env python3
"""Reproducible synthetic ORD-shaped SQLite graph for external-memory DSA tests.

The molecule IDs are SYNTHETIC labels, not valid SMILES or real ORD chemistry.
Do not use the generated dataset to make chemical claims.
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import sqlite3


def generate(directory: Path, nodes: int, queries: int, seed: int):
    if nodes < 60 or nodes % 3:
        raise ValueError("nodes must be >=60 and divisible by 3")
    directory.mkdir(parents=True, exist_ok=True)
    database = directory / "ord.sqlite"
    if database.exists():
        database.unlink()
    db = sqlite3.connect(database)
    db.executescript("""
    PRAGMA journal_mode=DELETE;
    PRAGMA synchronous=NORMAL;
    CREATE TABLE ord_reactions(
      id INTEGER PRIMARY KEY,
      ord_id TEXT NOT NULL UNIQUE,
      reaction_smiles TEXT NOT NULL DEFAULT '',
      source_file TEXT NOT NULL
    );
    CREATE TABLE ord_participants(
      smiles TEXT NOT NULL, reaction_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('reactant','agent','product')),
      PRIMARY KEY(smiles,reaction_id,role)
    ) WITHOUT ROWID;
    CREATE TABLE ord_files(
      source_file TEXT PRIMARY KEY,
      processed INTEGER, records INTEGER, indexed INTEGER
    );
    CREATE TABLE ord_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX idx_ord_participants_reaction_role_smiles
      ON ord_participants(reaction_id,role,smiles);
    """)
    group_nodes = nodes // 3

    def identifier(group: int, offset: int):
        return f"SIM{group}_{offset:06d}"

    # Three disconnected groups, each with deterministic forward skip edges.
    # The graph contains long chains, shortcuts and unreachable cross-group
    # queries, but does not represent chemistry.
    reaction_rows = []
    participant_rows = []
    rid = 0
    for group in range(3):
        for start in range(group_nodes):
            for step in (1, 7, 17):
                if start + step >= group_nodes:
                    continue
                source, target = identifier(group, start), identifier(group, start + step)
                rid += 1
                reaction_rows.append((rid, f"ord-synthetic-{rid:08d}",
                                      f"{source}>>{target}", "synthetic-fixture"))
                participant_rows.append((source, rid, "reactant"))
                participant_rows.append((target, rid, "product"))
    db.executemany("INSERT INTO ord_reactions VALUES (?,?,?,?)", reaction_rows)
    db.executemany("INSERT INTO ord_participants VALUES (?,?,?)", participant_rows)
    db.execute("INSERT INTO ord_meta VALUES (?,?)", ("fixture", "deterministic-synthetic"))
    db.execute("INSERT INTO ord_files VALUES (?,?,?,?)",
               ("synthetic-fixture", 1, len(reaction_rows), len(reaction_rows)))
    db.commit()
    db.close()

    randomizer = random.Random(seed)
    rows = []
    for i in range(queries):
        mode = i % 5
        first = randomizer.randrange(3)
        if mode in (0, 1, 2):
            a = randomizer.randrange(0, max(1, group_nodes - 120))
            b = min(group_nodes - 1, a + randomizer.randrange(1, 121))
            rows.append((identifier(first, a), identifier(first, b)))
        elif mode == 3:
            # A -> another disconnected component: exhaustive no-path.
            second = (first + 1) % 3
            rows.append((identifier(first, randomizer.randrange(group_nodes)),
                         identifier(second, randomizer.randrange(group_nodes))))
        else:
            item = identifier(first, randomizer.randrange(group_nodes))
            rows.append((item, item))
    paths = directory / "queries.tsv"
    paths.write_text("# from\\tto (synthetic IDs, fixed seed)\n" +
                     "".join(f"{source}\t{target}\n" for source, target in rows),
                     encoding="utf-8")
    digest = hashlib.sha256(paths.read_bytes()).hexdigest()
    manifest = {
        "nodes": nodes,
        "reactionRecords": len(reaction_rows),
        "participationLinks": len(reaction_rows),
        "queryCount": len(rows),
        "seed": seed,
        "queryFileSHA256": digest,
        "source": "SYNTHETIC DSA GRAPH — NOT REAL SMILES OR ORD REACTIONS",
    }
    (directory / "manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--nodes", type=int, default=3000)
    parser.add_argument("--queries", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if not 1 <= args.queries <= 300:
        parser.error("--queries must be between 1 and 300")
    generate(args.output_dir, args.nodes, args.queries, args.seed)
