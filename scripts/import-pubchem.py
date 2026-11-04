#!/usr/bin/env python3
"""Install 500,000 genuine PubChem CID/SMILES records in a disk-backed catalog.

The original curated ChemPath reaction graph remains unchanged. These are
PubChem *compound records*, NOT 500,000 experimentally connected reactions.

Official source:
  https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz

A gzip stream is read only until the target record count is reached, avoiding
downloading the full ~100M+ CID file. The final SQLite file replaces the
existing catalog atomically, so a failed download cannot corrupt it.

Examples:
  python3 scripts/import-pubchem.py
  python3 scripts/import-pubchem.py --source-file /tmp/CID-SMILES.gz
  python3 scripts/import-pubchem.py --source-file /tmp/fixture.tsv --target 10 --output /tmp/catalog.sqlite
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz"
DEFAULT_OUTPUT = ROOT / "data" / "catalog" / "pubchem.sqlite"
MAX_TARGET = 500_000


@contextlib.contextmanager
def open_source(filename: Path | None):
    if filename:
        with filename.open("rb") as raw:
            if filename.suffix.lower() == ".gz":
                with gzip.GzipFile(fileobj=raw) as stream:
                    yield stream
            else:
                yield raw
        return
    request = urllib.request.Request(
        SOURCE_URL, headers={"User-Agent": "ChemPath-DSA-Catalog/1.0 (PubChem bulk download)"}
    )
    # Close the network stream immediately after the first 500k qualifying CIDs.
    with urllib.request.urlopen(request, timeout=90) as response:
        with gzip.GzipFile(fileobj=response) as stream:
            yield stream


def import_compounds(source_file: Path | None, output: Path, target: int) -> dict:
    if not 1 <= target <= MAX_TARGET:
        raise ValueError(f"target must be 1..{MAX_TARGET:,}")
    output.parent.mkdir(parents=True, exist_ok=True)
    # Use a per-process temporary DB: only publish after the full verified count.
    temp = output.with_name(output.name + f".{__import__('os').getpid()}.partial")
    temp.unlink(missing_ok=True)
    began = time.monotonic()
    count = 0
    invalid = 0
    sha = hashlib.sha256()
    db = sqlite3.connect(temp)
    try:
        db.executescript("""
            PRAGMA journal_mode = DELETE;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -32768;
            CREATE TABLE compounds (
                cid INTEGER PRIMARY KEY,
                smiles TEXT NOT NULL CHECK(length(smiles) BETWEEN 1 AND 2048)
            );
            CREATE TABLE catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        db.execute("BEGIN")
        rows = []
        with open_source(source_file) as source:
            for raw in source:
                # CID-SMILES is a tab-delimited, two-column text file.
                # Keep the exact PubChem isomeric SMILES; do not fabricate names.
                parts = raw.rstrip(b"\r\n").split(b"\t", 1)
                if len(parts) != 2:
                    invalid += 1
                    continue
                cid_raw, smiles_raw = parts
                if not cid_raw.isdigit() or not 1 <= len(smiles_raw) <= 2048:
                    invalid += 1
                    continue
                try:
                    cid = int(cid_raw)
                    smiles = smiles_raw.decode("utf-8")
                except (UnicodeDecodeError, ValueError):
                    invalid += 1
                    continue
                if cid <= 0 or "\x00" in smiles:
                    invalid += 1
                    continue
                rows.append((cid, smiles))
                sha.update(cid_raw + b"\t" + smiles_raw + b"\n")
                if len(rows) >= 5000:
                    before = db.total_changes
                    db.executemany("INSERT OR IGNORE INTO compounds VALUES (?,?)", rows)
                    count += db.total_changes - before
                    rows.clear()
                    if count and count % 50000 == 0:
                        print(f"Indexed {count:,}/{target:,} PubChem CID records", flush=True)
                    if count >= target:
                        break
            if rows and count < target:
                before = db.total_changes
                db.executemany("INSERT OR IGNORE INTO compounds VALUES (?,?)", rows[:target-count])
                count += db.total_changes - before
        if count != target:
            raise RuntimeError(
                f"Source ended with {count:,} distinct records; expected {target:,}. "
                "Existing database was NOT replaced."
            )
        db.commit()
        # SQL B-tree supports exact CID, exact SMILES and prefix-range lookup.
        db.execute("CREATE INDEX idx_compounds_smiles ON compounds(smiles)")
        date = datetime.datetime.now(datetime.timezone.utc).isoformat()
        meta = {
            "source": "PubChem Compound Extras",
            "source_url": SOURCE_URL if source_file is None else str(source_file),
            "count": str(count),
            "imported_at": date,
            "records_digest_sha256": sha.hexdigest(),
            "format": "CID-SMILES",
            "data_note": "Structure-only catalog. Not a reaction network or chemically validated synthesis planner.",
        }
        db.executemany("INSERT INTO catalog_meta(key,value) VALUES (?,?)", meta.items())
        db.commit()
        query = db.execute("PRAGMA integrity_check").fetchone()[0]
        if query != "ok":
            raise RuntimeError("SQLite catalog integrity check failed: " + str(query))
        # Avoid guessing the source count. SQLite confirms every inserted CID.
        actual = db.execute("SELECT COUNT(*) FROM compounds").fetchone()[0]
        if actual != target:
            raise RuntimeError(f"Catalog verification failed: {actual} != {target}")
    except Exception:
        db.close()
        temp.unlink(missing_ok=True)
        raise
    db.close()
    temp.replace(output)
    details = {
        "count": count, "target": target, "skippedInvalid": invalid,
        "output": str(output), "elapsedSeconds": round(time.monotonic()-began, 2),
        "source": meta["source_url"], "digest": meta["records_digest_sha256"]
    }
    print(json.dumps(details, indent=2), flush=True)
    return details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path, help="Local tab-delimited CID-SMILES[.gz] for offline imports")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--target", type=int, default=MAX_TARGET)
    args = parser.parse_args()
    if args.source_file and not args.source_file.is_file():
        parser.error("Source file not found: " + str(args.source_file))
    try:
        import_compounds(args.source_file, args.output, args.target)
    except Exception as exc:
        print("PubChem catalog import failed: " + str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
