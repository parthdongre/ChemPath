#!/usr/bin/env python3
"""Import a capped or complete Rhea reaction-SMILES snapshot into ChemPath.

The reaction-SMILES TSV contains *directed* reaction records. Preserve each
record's direction; never infer reversibility from its chemical equation.

Examples:
  python scripts/import-rhea.py --limit 1500
  python scripts/import-rhea.py --all
  python scripts/import-rhea.py --all --source-file /path/to/rhea-reaction-smiles.tsv
  python scripts/import-rhea.py --all --rhea-only --output /tmp/rhea-graph
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import tempfile
from collections import Counter
from pathlib import Path
import urllib.request

from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

SOURCE = "https://ftp.expasy.org/databases/rhea/tsv/rhea-reaction-smiles.tsv"
ROOT = Path(__file__).resolve().parents[1]
COMPOUND_HEADER = ["id", "name", "formula", "category"]
REACTION_HEADER = ["id", "name", "reactants", "products", "equation",
                   "conditions", "reversible", "note", "source", "cost"]
BAD = re.compile(r"[|;\r\n\x00]")
ID_PATTERN = re.compile(r"(?:RHEA:)?(\d+)", re.IGNORECASE)


def canonical(raw: str):
    if not raw or len(raw) > 2048 or BAD.search(raw):
        return None
    mol = Chem.MolFromSmiles(raw)
    if mol is None:
        return None
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    key = Chem.MolToSmiles(mol, isomericSmiles=True)
    if not key or len(key) > 2048 or BAD.search(key):
        return None
    return key, rdMolDescriptors.CalcMolFormula(mol)


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_source(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "ChemPath-DSA-Importer/2.0"})
    # Stream to disk instead of retaining the full upstream TSV in RAM.
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
        temp = Path(tmp.name)
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                shutil.copyfileobj(response, tmp, length=1024 * 1024)
            tmp.flush()
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)


def load_curated(root: Path):
    def load(path: Path, expected: list[str]):
        with path.open(encoding="utf-8", newline="") as stream:
            reader = csv.reader(stream, delimiter="|")
            if next(reader, None) != expected:
                raise ValueError(f"Unexpected curated header in {path}")
            return list(reader)
    return (load(root / "data/compounds.csv", COMPOUND_HEADER),
            load(root / "data/reactions.csv", REACTION_HEADER))


def write_rows(path: Path, header: list[str], rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="|", lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def import_file(source_file: Path, output: Path, limit: int | None,
                include_curated: bool = True, base_root: Path = ROOT):
    if include_curated:
        compounds, reactions = load_curated(base_root)
    else:
        compounds, reactions = [], []
    curated_count = len(reactions)
    by_name = {row[1].lower(): int(row[0]) for row in compounds}
    if len(by_name) != len(compounds) or any(int(row[0]) != i for i, row in enumerate(compounds)):
        raise ValueError("Curated compound IDs must be unique and contiguous")
    if any(int(row[0]) != i for i, row in enumerate(reactions)):
        raise ValueError("Curated reaction IDs must be contiguous")

    fingerprints: dict[tuple, int] = {}
    rhea_ids: set[str] = set()
    aliases: list[list[str]] = []
    counters: Counter[str] = Counter()

    def add_compound(item):
        smiles, formula = item
        name = "RHEA:" + smiles
        if name.lower() not in by_name:
            by_name[name.lower()] = len(compounds)
            compounds.append([str(len(compounds)), name, formula, "Biochemical"])
        return name

    with source_file.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.reader(stream, delimiter="\t"):
            if limit is not None and len(reactions) - curated_count >= limit:
                break
            if not row or not any(cell.strip() for cell in row):
                continue
            first = row[0].strip()
            if first.upper().replace("-", "_") in {"RHEA_ID", "RHEAID"}:
                continue
            counters["source_rows"] += 1
            matched = ID_PATTERN.fullmatch(first)
            if len(row) < 2 or not matched or not row[1].strip():
                counters["skipped_format"] += 1
                continue
            rid = matched.group(1)
            if rid in rhea_ids:
                counters["duplicate_ids"] += 1
                continue
            rhea_ids.add(rid)
            parts = row[1].strip().split(">>")
            if len(parts) != 2:
                counters["skipped_format"] += 1
                continue
            left = parts[0].split(".")
            right = parts[1].split(".")
            if not left or not right or len(left) > 128 or len(right) > 128:
                counters["skipped_format"] += 1
                continue
            reactants = [canonical(value) for value in left]
            products = [canonical(value) for value in right]
            if any(item is None for item in reactants + products):
                counters["skipped_smiles"] += 1
                continue
            # Preserve multiplicity in the fingerprint (stoichiometry is not
            # used in simple availability closure, but source identity matters).
            fingerprint = (tuple(sorted(item[0] for item in reactants)),
                           tuple(sorted(item[0] for item in products)))
            if fingerprint in fingerprints:
                aliases.append([rid, str(fingerprints[fingerprint]), "duplicate_transformation"])
                counters["duplicate_transformations"] += 1
                continue

            reactant_names = list(dict.fromkeys(add_compound(item) for item in reactants))
            product_names = list(dict.fromkeys(add_compound(item) for item in products))
            graph_id = len(reactions)
            fingerprints[fingerprint] = graph_id
            aliases.append([rid, str(graph_id), "primary"])
            reactions.append([
                str(graph_id), "Rhea reaction " + rid,
                ";".join(reactant_names), ";".join(product_names),
                " + ".join(item[0] for item in reactants) + " -> " +
                " + ".join(item[0] for item in products),
                "Reaction conditions and cofactors must be checked in Rhea",
                "false", "Rhea directed reaction ID " + rid,
                "RHEA_CC_BY_4_0", "1",
            ])
            counters["imported_reactions"] += 1

    if not counters["imported_reactions"]:
        raise ValueError("No valid unique Rhea reaction records imported")
    output.mkdir(parents=True, exist_ok=True)
    write_rows(output / "compounds.csv", COMPOUND_HEADER, compounds)
    write_rows(output / "reactions.csv", REACTION_HEADER, reactions)
    write_rows(output / "rhea-aliases.tsv", ["rhea_id", "reaction_id", "status"], aliases)
    report = {
        "source_url": SOURCE,
        "source_sha256": source_hash(source_file),
        "import_mode": "full" if limit is None else "limited",
        "requested_limit": limit,
        "includes_curated": include_curated,
        "curated_reactions": curated_count,
        "unique_compounds_total": len(compounds),
        "reactions_total": len(reactions),
        "source_records_examined": counters["source_rows"],
        "rhea_reactions_imported": counters["imported_reactions"],
        "duplicate_transformations": counters["duplicate_transformations"],
        "duplicate_ids": counters["duplicate_ids"],
        "skipped_format": counters["skipped_format"],
        "skipped_smiles": counters["skipped_smiles"],
        "reaction_direction_policy": "Retain each TSV record direction; no inferred reverse edges",
        "license": "Rhea data CC BY 4.0",
    }
    (output / "manifest.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "SOURCES.md").write_text(
        "# Rhea import provenance\n\n"
        f"Official source: {SOURCE}\n\n"
        "Data license: CC BY 4.0; https://www.rhea-db.org/help/license\n\n"
        f"SHA256 of source TSV: {report['source_sha256']}\n\n"
        f"Imported Rhea reaction records: {report['rhea_reactions_imported']}\n\n"
        f"Unique compound nodes (total): {report['unique_compounds_total']}\n\n"
        "Each source directional reaction is retained as a directed record. "
        "Duplicates of the same directional scheme are mapped in rhea-aliases.tsv. "
        "Read manifest.json for skip counts.\n\n"
        "The input is a reaction participation dataset and does not establish "
        "that chemical synthesis routes are experimentally feasible.\n",
        encoding="utf-8",
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--limit", type=int, help="Maximum unique imported reactions (default 1500)")
    mode.add_argument("--all", action="store_true", help="Import all usable source reactions")
    parser.add_argument("--source-file", type=Path, help="Pinned local source TSV (offline/reproducible)")
    parser.add_argument("--cache-file", type=Path, default=ROOT / "data/rhea/cache/rhea-reaction-smiles.tsv")
    parser.add_argument("--refresh", action="store_true", help="Download a new upstream snapshot")
    parser.add_argument("--rhea-only", action="store_true", help="Do not append curated teaching dataset")
    parser.add_argument("--output", type=Path, default=ROOT / "data/expanded")
    args = parser.parse_args()
    limit = None if args.all else 1500 if args.limit is None else args.limit
    if limit is not None and not 1 <= limit <= 1000000:
        parser.error("--limit must be 1 to 1000000")
    if args.source_file and args.refresh:
        parser.error("--refresh cannot be used with --source-file")
    source_file = args.source_file or args.cache_file
    if not source_file.is_file() or (args.refresh and not args.source_file):
        if args.source_file:
            parser.error("--source-file does not exist")
        download_source(source_file)
    report = import_file(source_file, args.output, limit,
                         include_curated=not args.rhea_only)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
