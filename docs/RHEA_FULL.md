# Full Rhea Import — Milestone A

The ChemPath Rhea importer reads Rhea's **directed reaction SMILES TSV**.
Every record is a directed reaction; ChemPath does **not** fabricate reverse
edges for reaction IDs that are not explicitly marked reversible in the
underlying data. The downloaded source is Rhea data under CC BY 4.0.

Official source: https://ftp.expasy.org/databases/rhea/tsv/rhea-reaction-smiles.tsv
Rhea download documentation: https://www.rhea-db.org/help/download
License: https://www.rhea-db.org/help/license

## Reproduce

Install RDKit in a local Python environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install rdkit
python scripts/import-rhea.py --all
```

By default, the full source TSV is cached in ignored
`data/rhea/cache/rhea-reaction-smiles.tsv`, and the generated full graph
is placed in ignored `data/rhea/full/`. The original curated dataset
remains unchanged. A smaller `--limit 1500` import continues to use
`data/expanded/` for backwards compatibility.

For a pinned, reproducible source snapshot:

```bash
python scripts/import-rhea.py --all --source-file /path/to/rhea-reaction-smiles.tsv
CHEMPATH_DATA_DIR=data/rhea/full npm run dev
```

Optional standalone Rhea dataset:
`python scripts/import-rhea.py --all --rhea-only --output data/rhea/full`.

## Outputs

- `compounds.csv` — integer IDs and canonicalized RDKit SMILES.
- `reactions.csv` — directed reaction records and their graph IDs.
- `rhea-aliases.tsv` — source ID to kept graph ID, preserving references
  to duplicate directional transformations.
- `manifest.json` — source SHA256, mode, imported record counts,
  duplicate counts, validation skips, and total compounds.
- `SOURCES.md` — source URL, attribution, summary statistics.

For deterministic builds, import the same source bytes and options.
The rows, IDs and manifest are independent of wall-clock time. Different
source releases can legitimately change totals.

## Tests

```bash
python scripts/test_import_rhea.py -v
npm run build:engine
npm run test:engine
node scripts/smoke-api.mjs
```

The offline Rhea test fixture checks directional preservation,
duplicate detection, invalid SMILES rejection, and byte-for-byte output
reproducibility. The C++ dependency tests are separate from the unchanged
legacy participation-path regression suite.

## Boundaries

The importer removes atom maps and canonicalizes SMILES while retaining
stereochemical distinctions supported by RDKit. Input reaction stoichiometry
is reflected in the duplicate fingerprint, but ChemPath's CSV graph does
not model quantities. Reactants are semicolon-delimited unique participants.
Malformed or unsupported records are counted and skipped; this is the
**full usable imported subset**, not a guarantee that every upstream source
record is representable.

The new dependency-closure mode checks whether each required compound is
available. It is not a laboratory synthesis planner and does not validate
conditions, atom balance, yield, or catalysts.
