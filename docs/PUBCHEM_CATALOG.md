# ChemPath PubChem catalog — 8 million compounds by default

ChemPath Studio supports a **default extended catalog of 8,000,000 genuine
PubChem compound records** (PubChem CIDs and SMILES), with an **optional full
CID–SMILES corpus** mode. It is a searchable, disk-backed structure catalog,
not a graph of 8 million chemically validated reactions.

## Install or upgrade on macOS

From the root of ChemPath:

```bash
git pull --ff-only origin main
npm run data:8m
npm run dev
```

Open **Data Library → PubChem compound catalog**. The status shows the actual
installed record count and whether the 8M recommendation is satisfied.

The file is located at `data/catalog/pubchem.sqlite`. It is deliberately
excluded from Git. `git pull` preserves this file and **does not automatically
download gigabytes**.

If you already installed 500,000 records, `npm run data:8m` constructs a
new 8M database beside the existing one. Only once the new file has exactly
8M indexed PubChem records and passes a SQLite integrity check does it
atomically replace the existing file. Interrupted or failed downloads preserve
the working database.

## Commands

| Command | Meaning |
| --- | --- |
| `npm run data:8m` | Default: ensure at least **8,000,000** PubChem CIDs exist locally |
| `npm run data:sync` | Same idempotent 8M check; safe after every `git pull` |
| `npm run data:500k` | Legacy compact option; never downgrades an 8M install |
| `npm run data:full` | Explicitly read the **entire CID–SMILES gzip source to EOF** |
| `npm run data:8m -- --force` | Deliberately redownload an 8M source snapshot |

The importer does not check whether upstream PubChem has changed. **Sync**
means “ensure this amount is present,” not “download latest source updates.”
A forced import contacts PubChem again. If you have installed the full corpus,
use `npm run data:full -- --force` to refresh it without downgrading.

## PubChem data source

Official NCBI PubChem bulk download:

https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz

- The importer **streams compressed data** directly from NCBI; the default
  importer stops at 8M distinct valid CIDs instead of retrieving all source
  records.
- SQLite uses an indexed CID primary key and a SMILES B-tree for bounded,
  case-sensitive prefix search.
- The React interface retrieves **24 records per page**; it never renders
  millions of graph nodes.
- A completed install records a timestamp, source URL, record count, import
  scope and input digest.
- Disk space depends on actual compound structures and SQLite indexing.
  Plan for **a few gigabytes of free space** when upgrading to 8M; the full
  PubChem source requires substantially more.
- Optional `CHEMPATH_PUBCHEM_DB` and `CHEMPATH_DATA_DIR` environment
  variables override the catalog path.

## API and verification

```bash
curl http://localhost:8787/api/catalog/status
curl 'http://localhost:8787/api/catalog/search?limit=24'
curl 'http://localhost:8787/api/catalog/search?q=CID%202244'
curl 'http://localhost:8787/api/catalog/search?q=CCO'
node scripts/test-pubchem-catalog.mjs
npm run verify:release
```

Example status when the 8M catalog has been installed:

```json
{
  "ok": true,
  "available": true,
  "target": 8000000,
  "compounds": 8000000,
  "meetsTarget": true,
  "scope": "prefix",
  "structureOnly": true
}
```

These values illustrate the API response, **not** an assertion that
a specific machine has already downloaded the 8M catalog.

The optional **Build Real PubChem 8M Catalog** GitHub Actions workflow can
generate a verified SQLite artifact from the actual PubChem source. GitHub
Actions artifacts expire and large archives should not be stored in Git.

## Scientific scope and limitations

- **CID–SMILES catalog ≠ reaction graph.** The C++ Dijkstra/A*/BFS/DFS
  engine continues to traverse only imported reaction edges.
- Imported PubChem records do not automatically gain catalysts, reagents,
  reaction conditions, yields, atom mapping, or pathway connections.
- The importer intentionally uses source CID and SMILES without inventing
  common names or assigning chemical feasibility.
- The full mode downloads the complete **CID–SMILES source stream**, not
  PubChem's assays, synonyms, 3D conformers, properties or all data products.
- Records that cannot be decoded or exceed importer safety bounds are
  counted as skipped; inspect `skippedInvalid` in the output.
- The in-browser graph remains bounded for interactive rendering even
  when millions of compounds are stored on disk.
