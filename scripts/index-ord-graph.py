#!/usr/bin/env python3
"""Add the disk-backed ORD reaction-ID lookup index to an EXISTING SQLite DB.

No downloads or reimport needed. The index may require substantial temporary
disk space for millions of reaction participants.
"""
import argparse
import sqlite3
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("data/ord/ord.sqlite"))
    args = parser.parse_args()
    if not args.db.is_file():
        parser.error(f"Database not found: {args.db}")
    began = time.perf_counter()
    db = sqlite3.connect(str(args.db))
    try:
        db.execute("PRAGMA busy_timeout=60000")
        tables = {name for (name,) in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        if not {"ord_reactions", "ord_participants"} <= tables:
            parser.error("Not an ORD SQLite index: required tables are missing")
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_ord_participants_reaction_role_smiles "
            "ON ord_participants(reaction_id, role, smiles)"
        )
        db.commit()
        plan = list(db.execute(
            "EXPLAIN QUERY PLAN SELECT smiles FROM ord_participants "
            "WHERE reaction_id=? AND role='product'", (1,)
        ))
        if not any("idx_ord_participants_reaction_role_smiles" in str(row) for row in plan):
            raise RuntimeError("SQLite query planner did not use the ORD reaction index")
        count = db.execute("SELECT COUNT(*) FROM ord_participants").fetchone()[0]
        print(f"Index ready. Participant records: {count:,}; elapsed "
              f"{time.perf_counter()-began:.2f}s")
        print("Index: idx_ord_participants_reaction_role_smiles")
        for entry in plan:
            print("PLAN:", entry[-1])
    finally:
        db.close()


if __name__ == "__main__":
    main()
