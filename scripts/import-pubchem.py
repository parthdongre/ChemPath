#!/usr/bin/env python3
"""Install a default 8-million-record PubChem CID/SMILES catalog on disk.

The original curated ChemPath reaction graph remains unchanged. These are
PubChem *compound structures*, NOT millions of experimentally connected reactions.

Official source:
  https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz

A gzip stream is read only until the requested record count is reached.
The default is eight million real CIDs; --all is the explicit full-corpus
option (read to the gzip EOF). If the installed catalog already contains
at least the requested amount, the importer skips the download. --force
refreshes from PubChem. Existing data is atomically preserved on failure.

Examples:
  python3 scripts/import-pubchem.py
  python3 scripts/import-pubchem.py --target 500000
  python3 scripts/import-pubchem.py --all
  python3 scripts/import-pubchem.py --force
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
import os
from pathlib import Path
import sqlite3
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz"
DEFAULT_OUTPUT = ROOT / "data" / "catalog" / "pubchem.sqlite"
DEFAULT_TARGET = 8_000_000
MAX_SMILES_BYTES = 1_000_000


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
    # The caller closes the stream at the requested count, or at EOF for --all.
    with urllib.request.urlopen(request, timeout=90) as response:
        with gzip.GzipFile(fileobj=response) as stream:
            yield stream


def installed_catalog(output: Path) -> dict | None:
    """Read trusted installation metadata. Fail closed for corrupt/incomplete DBs."""
    if not output.is_file():
        return None
    try:
        with sqlite3.connect(output.resolve().as_uri() + "?mode=ro", uri=True) as db:
            meta = dict(db.execute("SELECT key,value FROM catalog_meta"))
            if meta.get("format") != "CID-SMILES":
                return None
            count = int(meta["count"])
            if count < 1:
                return None
            actual = db.execute("SELECT COUNT(*) FROM compounds").fetchone()[0]
            return {**meta, "count": count} if actual == count else None
    except (sqlite3.Error, ValueError, KeyError, OSError):
        return None


def import_compounds(
    source_file: Path | None, output: Path, target: int | None, force: bool = False
) -> dict:
    if target is not None and target < 1:
        raise ValueError("target must be a positive integer")
    existing = installed_catalog(output)
    # Catalog upgrade is monotone: don't overwrite a full install with a prefix.
    if not force and existing and (
        (target is not None and existing["count"] >= target) or
        (target is None and existing.get("scope") == "full")
    ):
        details = {
            "status": "already-installed", "count": existing["count"],
            "target": target if target is not None else "full",
            "scope": existing.get("scope", "prefix"),
            "output": str(output),
            "source": existing.get("source_url"),
            "hint": "Use --force to reimport explicitly from PubChem; existing data remains otherwise."
        }
        print(json.dumps(details, indent=2), flush=True)
        return details
    output.parent.mkdir(parents=True, exist_ok=True)
    # Use a per-process temporary DB: only publish after the full verified count.
    temp = output.with_name(output.name + f".{os.getpid()}.partial")
    temp.unlink(missing_ok=True)
    began = time.monotonic()
    count = 0
    invalid = 0
    last_progress = 0
    sha = hashlib.sha256()
    db = sqlite3.connect(temp)
    try:
        db.executescript("""
            PRAGMA journal_mode = DELETE;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -65536;
            PRAGMA temp_store = FILE;
            CREATE TABLE compounds (
                cid INTEGER PRIMARY KEY,
                smiles TEXT NOT NULL CHECK(length(smiles) BETWEEN 1 AND 1000000)
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
                if not cid_raw.isdigit() or not 1 <= len(smiles_raw) <= MAX_SMILES_BYTES:
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
                    wanted = len(rows) if target is None else min(len(rows), target - count)
                    db.executemany("INSERT OR IGNORE INTO compounds VALUES (?,?)", rows[:wanted])
                    count += db.total_changes - before
                    rows.clear()
                    if count - last_progress >= (500_000 if target is None else 100_000):
                        print(
                            f"Indexed {count:,}" +
                            (f"/{target:,}" if target is not None else "") +
                            " PubChem CID records", flush=True
                        )
                        last_progress = count
                    # A partial SQLite file is disposable, so checkpoint commits
                    # avoid a multi-gigabyte transaction log during a full import.
                    if count and count % 50_000 == 0:
                        db.commit()
                        db.execute("BEGIN")
                    if target is not None and count >= target:
                        break
            if rows and (target is None or count < target):
                before = db.total_changes
                wanted = len(rows) if target is None else min(len(rows), target - count)
                db.executemany("INSERT OR IGNORE INTO compounds VALUES (?,?)", rows[:wanted])
                count += db.total_changes - before
        if target is not None and count != target:
            raise RuntimeError(
                f"Source ended with {count:,} distinct records; expected {target:,}. "
                "Existing database was NOT replaced."
            )
        if not count:
            raise RuntimeError("No valid PubChem CIDs were found; existing database preserved.")
        db.commit()
        # SQL B-tree supports exact CID, exact SMILES and prefix-range lookup.
        db.execute("CREATE INDEX idx_compounds_smiles ON compounds(smiles)")
        date = datetime.datetime.now(datetime.timezone.utc).isoformat()
        meta = {
            "source": "PubChem Compound Extras",
            "source_url": SOURCE_URL if source_file is None else str(source_file),
            "count": str(count),
            "scope": "full" if target is None else "prefix",
            "requested_count": "full" if target is None else str(target),
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
        if actual != count:
            raise RuntimeError(f"Catalog verification failed: {actual} != {count}")
    except Exception:
        db.close()
        temp.unlink(missing_ok=True)
        raise
    db.close()
    temp.replace(output)
    details = {
        "status": "imported", "count": count, "target": target if target is not None else "full",
        "scope": "full" if target is None else "prefix", "skippedInvalid": invalid,
        "output": str(output), "elapsedSeconds": round(time.monotonic()-began, 2),
        "source": meta["source_url"], "digest": meta["records_digest_sha256"]
    }
    print(json.dumps(details, indent=2), flush=True)
    return details


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path, help="Local tab-delimited CID-SMILES[.gz] for offline imports")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--target", type=int, default=None,
                       help=f"Number of real CIDs to index (default {DEFAULT_TARGET:,})")
    scope.add_argument("--all", action="store_true",
                       help="Explicitly index every record in the full PubChem gzip corpus")
    parser.add_argument("--force", action="store_true",
                        help="Rebuild even if enough records are already installed")
    args = parser.parse_args()
    if args.source_file and not args.source_file.is_file():
        parser.error("Source file not found: " + str(args.source_file))
    try:
        import_compounds(args.source_file, args.output,
                         None if args.all else (args.target if args.target is not None else DEFAULT_TARGET),
                         force=args.force)
    except Exception as exc:
        print("PubChem catalog import failed: " + str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
