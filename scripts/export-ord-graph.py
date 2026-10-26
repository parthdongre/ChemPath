#!/usr/bin/env python3
"""Export a bounded ORD SQLite subset to ChemPath's C++ CSV graph format.

The extracted directed network is a reaction-participation graph, NOT a
validated chemical synthesis planner. All co-reactants are required in a
real reaction, which compound-to-compound BFS cannot enforce.
"""
import argparse
import csv
import hashlib
from pathlib import Path
import sqlite3
import re

ROOT = Path(__file__).resolve().parents[1]
COMP_FIELDS = ["id", "name", "formula", "category"]
RX_FIELDS = ["id", "name", "reactants", "products", "equation", "conditions",
             "reversible", "note", "source", "cost"]
BAD = re.compile(r"[|;\r\n]")


def export(db_path: Path, output: Path, limit: int):
    db = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    compounds = []
    reactions = []
    seen = {}
    def compound(smiles):
        if smiles not in seen:
            name = "SMILES:" + smiles
            seen[smiles] = name
            compounds.append([len(compounds), name, smiles[:100], "ORD molecule"])
        return seen[smiles]

    for row in db.execute(
        "SELECT ord_id, reaction_smiles FROM ord_reactions "
        "WHERE reaction_smiles <> '' ORDER BY id LIMIT ?", (limit * 5,)
    ):
        fields = row["reaction_smiles"].split(">")
        if len(fields) != 3:
            continue
        left, agents, right = fields
        reactants = list(dict.fromkeys(x for x in left.split(".")
                                       if x and len(x) <= 160 and not BAD.search(x)))
        products = list(dict.fromkeys(x for x in right.split(".")
                                      if x and len(x) <= 160 and not BAD.search(x)))
        if not reactants or not products or len(reactants) > 12 or len(products) > 12:
            continue
        rnames = [compound(v) for v in reactants]
        pnames = [compound(v) for v in products]
        reactions.append([
            len(reactions), "ORD " + row["ord_id"],
            ";".join(rnames), ";".join(pnames),
            " + ".join(reactants) + " -> " + " + ".join(products),
            "ORD source: reaction SMILES (see record); agents: " + agents[:120],
            "false", "CC BY-SA 4.0; source https://open-reaction-database.org",
            "ORD_CC_BY_SA_4_0", "1"
        ])
        if len(reactions) >= limit:
            break

    db.close()
    if not reactions:
        raise RuntimeError("No reactions with valid structural identifiers in the ORD database")

    output.mkdir(parents=True, exist_ok=True)
    for name, header, rows in [
        ("compounds.csv", COMP_FIELDS, compounds),
        ("reactions.csv", RX_FIELDS, reactions),
    ]:
        with (output / name).open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter="|", lineterminator="\n")
            writer.writerow(header)
            writer.writerows(rows)
    (output / "SOURCES.md").write_text(
        "# ORD graph export\n\n"
        "Source: https://huggingface.co/datasets/open-reaction-database/ord-data\n"
        "Data license: CC BY-SA 4.0. Keep this dataset separate from the "
        "curated ChemPath dataset. The Graph projection assumes co-reactants "
        "are present and does not validate synthetic feasibility.\n\n"
        f"Reaction records: {len(reactions)}\nCompound nodes: {len(compounds)}\n",
        encoding="utf-8"
    )
    print(f"Exported {len(reactions):,} reactions and {len(compounds):,} unique "
          f"SMILES compound nodes to {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=ROOT / "data/ord/ord.sqlite")
    parser.add_argument("--limit", type=int, default=10000)
    parser.add_argument("--output", type=Path, default=ROOT / "data/ord-demo")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100000:
        parser.error("--limit must be between 1 and 100000")
    if not args.db.is_file():
        parser.error(f"Missing ORD SQLite database: {args.db}")
    export(args.db, args.output, args.limit)


if __name__ == "__main__":
    main()
