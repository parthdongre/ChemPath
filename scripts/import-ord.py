#!/usr/bin/env python3
"""Stream the official Open Reaction Database Parquet into indexed local SQLite.

Install: python3 -m pip install -r scripts/requirements-ord.txt
Small test: python3 scripts/import-ord.py --limit 20000
Full corpus: python3 scripts/import-ord.py --all

Data: https://huggingface.co/datasets/open-reaction-database/ord-data
License: CC BY-SA 4.0; original ORD dataset, stored separately from ChemPath.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
import re
import sqlite3
import sys
import time

ORD_REPO = "open-reaction-database/ord-data"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = ROOT / "data" / "ord" / "ord.sqlite"
MAPS = re.compile(r":\d+(?=\])")
FORBIDDEN = re.compile(r"[\x00-\x1f|;]")
SCHEMA_VERSION = "1"


def parse_reaction_smiles(value: str):
    """Return reactants, agents and products; never assert chemical feasibility."""
    if not value or len(value) > 4096:
        return None
    parts = value.strip().split(">")
    if len(parts) != 3:
        return None
    reactants, agents, products = [], [], []
    for text, destination in zip(parts, (reactants, agents, products)):
        for raw in text.split("."):
            clean = MAPS.sub("", raw.strip())
            if clean and len(clean) <= 512 and not FORBIDDEN.search(clean):
                destination.append(clean)
            elif raw.strip():
                return None
    if not reactants or not products or len(reactants) > 20 or len(products) > 20:
        return None
    return reactants, agents[:20], products


def identifier_value(identifiers, kind="SMILES"):
    for ident in identifiers:
        try:
            enum_value = ident.DESCRIPTOR.fields_by_name["type"].enum_type.values_by_number[
                ident.type
            ].name
        except (KeyError, AttributeError):
            continue
        if kind in enum_value and getattr(ident, "value", ""):
            return ident.value
    return ""


def reaction_smiles(reaction):
    for ident in reaction.identifiers:
        try:
            kind = ident.DESCRIPTOR.fields_by_name["type"].enum_type.values_by_number[
                ident.type
            ].name
        except (KeyError, AttributeError):
            continue
        if kind == "REACTION_SMILES" and ident.value:
            return ident.value
    # Fallback for records with structural input/output identifiers but
    # without an explicit REACTION_SMILES identifier.
    reactants, agents, products = [], [], []
    for rx_input in reaction.inputs.values():
        for compound in rx_input.components:
            smiles = identifier_value(compound.identifiers)
            if not smiles:
                continue
            try:
                role = compound.DESCRIPTOR.fields_by_name[
                    "reaction_role"
                ].enum_type.values_by_number[compound.reaction_role].name
            except (KeyError, AttributeError):
                role = "UNKNOWN"
            if role == "REACTANT":
                reactants.append(smiles)
            else:
                agents.append(smiles)
    for outcome in reaction.outcomes:
        for product in outcome.products:
            smiles = identifier_value(product.identifiers)
            if smiles:
                products.append(smiles)
        if products:
            break
    if reactants and products:
        return ".".join(reactants) + ">" + ".".join(agents) + ">" + ".".join(products)
    return ""


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=60)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA cache_size=-65536")
    db.execute("PRAGMA busy_timeout=60000")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS ord_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ord_reactions (
          id INTEGER PRIMARY KEY,
          ord_id TEXT NOT NULL UNIQUE,
          reaction_smiles TEXT NOT NULL DEFAULT '',
          source_file TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ord_participants (
          smiles TEXT NOT NULL,
          reaction_id INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('reactant','agent','product')),
          PRIMARY KEY (smiles, reaction_id, role)
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS ord_files (
          source_file TEXT PRIMARY KEY,
          processed INTEGER NOT NULL DEFAULT 0,
          records INTEGER NOT NULL DEFAULT 0,
          indexed INTEGER NOT NULL DEFAULT 0
        );
    """)
    db.execute("INSERT OR REPLACE INTO ord_meta VALUES (?, ?)", ("schema_version", SCHEMA_VERSION))
    db.execute("INSERT OR REPLACE INTO ord_meta VALUES (?, ?)", ("source", ORD_REPO))
    db.execute("INSERT OR REPLACE INTO ord_meta VALUES (?, ?)", ("license", "CC-BY-SA-4.0"))
    db.commit()
    return db


def import_parquet(db, path: Path, source: str, remaining: int | None):
    # Read a fixed-size batch of raw Protobuf rows. Never materialize a Dataset
    # or the massive 1.8M-reaction USPTO grants file in RAM.
    import pyarrow.parquet as pq
    from ord_schema.proto import reaction_pb2

    parquet = pq.ParquetFile(path)
    columns = set(parquet.schema_arrow.names)
    if "reaction" not in columns:
        raise ValueError(f"ORD source file missing reaction column: {source}")
    requested = ["reaction"] + (["reaction_id"] if "reaction_id" in columns else [])
    processed = indexed = 0
    db.execute("BEGIN")
    try:
        for batch in parquet.iter_batches(batch_size=256, columns=requested):
            values = batch.to_pydict()
            raws = values["reaction"]
            ids = values.get("reaction_id")
            for row, raw in enumerate(raws):
                if remaining is not None and processed >= remaining:
                    break
                processed += 1
                try:
                    record = reaction_pb2.Reaction.FromString(bytes(raw))
                except Exception:
                    continue
                ord_id = (ids[row] if ids else "") or record.reaction_id
                if not ord_id:
                    continue
                rx_smiles = reaction_smiles(record)
                parsed = parse_reaction_smiles(rx_smiles)
                cursor = db.execute(
                    "INSERT OR IGNORE INTO ord_reactions(ord_id,reaction_smiles,source_file) "
                    "VALUES (?,?,?)",
                    (ord_id, rx_smiles[:4096], source),
                )
                if cursor.rowcount != 1:
                    continue
                if parsed:
                    indexed += 1
                    rid = cursor.lastrowid
                    participants = [
                        (smiles, rid, role)
                        for role, molecules in zip(("reactant", "agent", "product"), parsed)
                        for smiles in dict.fromkeys(molecules)
                    ]
                    db.executemany(
                        "INSERT OR IGNORE INTO ord_participants "
                        "(smiles,reaction_id,role) VALUES (?,?,?)",
                        participants,
                    )
            if processed % 2048 == 0:
                db.commit()
                db.execute("BEGIN")
            if remaining is not None and processed >= remaining:
                break
        db.commit()
    except Exception:
        db.rollback()
        raise
    return processed, indexed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--all", action="store_true", help="Process every upstream Parquet file")
    mode.add_argument("--limit", type=int, default=None, help="Stop after N source rows")
    parser.add_argument("--max-files", type=int, default=None, help="Only use first N Parquet files")
    parser.add_argument("--db", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "data" / "ord" / "cache")
    parser.add_argument("--source-file", type=Path, action="append", default=[],
                        help="Use local ORD Parquet file(s) without downloading")
    args = parser.parse_args()

    if args.limit is not None and not 1 <= args.limit <= 10_000_000:
        parser.error("--limit must be between 1 and 10,000,000")
    if args.max_files is not None and args.max_files < 1:
        parser.error("--max-files must be positive")
    if not args.all and args.limit is None:
        args.limit = 20000

    try:
        import pyarrow  # noqa: F401
        from ord_schema.proto import reaction_pb2  # noqa: F401
    except ImportError as error:
        parser.error("Missing dependency: " + str(error) +
                     ". Install with python3 -m pip install -r scripts/requirements-ord.txt")

    if args.source_file:
        sources = [(str(p.resolve()), p.resolve()) for p in args.source_file]
    else:
        from huggingface_hub import HfApi, hf_hub_download
        files = HfApi().list_repo_files(ORD_REPO, repo_type="dataset")
        keys = sorted(name for name in files if name.startswith("data/") and
                      name.endswith(".parquet"))
        if args.max_files is not None:
            keys = keys[:args.max_files]
        if not keys:
            raise RuntimeError("No ORD Parquet files were listed by Hugging Face")
        sources = [(key, None) for key in keys]

    db = open_database(args.db)
    total = total_indexed = 0
    began = time.monotonic()
    try:
        for ordinal, (key, local_path) in enumerate(sources, 1):
            if args.limit is not None and total >= args.limit:
                break
            # A complete file is resume-safe; partially processed files are
            # retried with INSERT OR IGNORE. Partial-file counts are best-effort.
            status = db.execute(
                "SELECT processed FROM ord_files WHERE source_file=?", (key,)
            ).fetchone()
            if status and status[0] and args.limit is None:
                print(f"Skipping previously completed file: {key}", flush=True)
                continue
            if local_path is None:
                from huggingface_hub import hf_hub_download
                print(f"[{ordinal}/{len(sources)}] Downloading {key}", flush=True)
                local_path = Path(hf_hub_download(
                    repo_id=ORD_REPO, filename=key, repo_type="dataset",
                    cache_dir=str(args.cache_dir),
                ))
            remaining = args.limit - total if args.limit is not None else None
            count, indexed = import_parquet(db, local_path, key, remaining)
            total += count
            total_indexed += indexed
            # Mark a file complete only when it wasn't artificially cut off
            # by a requested row limit.
            complete = remaining is None or count < remaining
            db.execute(
                "INSERT OR REPLACE INTO ord_files VALUES (?,?,?,?)",
                (key, int(complete), count, indexed),
            )
            db.commit()
            print(f"    processed {count:,}, indexed {indexed:,} with SMILES; "
                  f"total processed this run {total:,}", flush=True)
        db.execute("INSERT OR REPLACE INTO ord_meta VALUES (?,?)",
                   ("updated_at", dt.datetime.now(dt.timezone.utc).isoformat()))
        db.commit()
        reactions = db.execute("SELECT COUNT(*) FROM ord_reactions").fetchone()[0]
        indexed_total = db.execute(
            "SELECT COUNT(*) FROM ord_reactions WHERE reaction_smiles <> ''"
        ).fetchone()[0]
        print(f"\nDatabase: {args.db}")
        print(f"ORD reaction IDs stored: {reactions:,}")
        print(f"Reactions with reaction SMILES: {indexed_total:,}")
        print(f"Rows visited this run: {total:,}; elapsed {time.monotonic()-began:.1f}s")
        print("Use npm run dev; open the 'ORD Database' section in the web UI.")
        if not args.all:
            print("For the full dataset: python3 scripts/import-ord.py --all")
    finally:
        db.close()


if __name__ == "__main__":
    main()
