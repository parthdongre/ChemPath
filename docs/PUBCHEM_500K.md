# PubChem 500,000-compound catalog

ChemPath can index **500,000 real PubChem compound records (CID and SMILES)**,
searched directly from disk through a separate SQLite-backed API.

This is a **structure catalog**, not a reaction-network expansion. A CID
record by itself does not supply reaction conditions, reactants, products,
catalysts or feasible transformations. The existing curated C++ reaction graph
still has its own count. Rhea/ORD reaction imports remain separate.

## Install the 500k source snapshot

Requires Python 3.10+ and an internet connection on the first run.

    npm run data:500k

This runs scripts/import-pubchem.py and creates:

    data/catalog/pubchem.sqlite

The installer streams the beginning of the official PubChem CID-SMILES.gz
in CID order and stops after indexing 500,000 distinct valid CID records.
It does **not** download the complete PubChem corpus and does not ask the
browser to render 500,000 nodes.

PubChem bulk source:
https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz

The importer verifies SQLite integrity and exact row count before
atomically replacing the final database. An interrupted installation
does not replace a previously verified catalog.

Alternatively, the GitHub Actions **Build Real PubChem 500k Catalog**
workflow downloads the public source and uploads a verified SQLite
artifact. Extract pubchem.sqlite into data/catalog/ to use it locally.

## Start ChemPath and browse

    npm run build:engine
    npm run dev

Open the **Data Library > PubChem compound catalog** section.

The interface displays the installed count, source, exact CID lookup,
SMILES prefix search, cursor-based pages of 24 records, and source links
to PubChem. The browser never loads 500k JSON objects at once.

The read-only HTTP API is also available:

    curl http://localhost:8787/api/catalog/status
    curl 'http://localhost:8787/api/catalog/search?limit=24'
    curl 'http://localhost:8787/api/catalog/search?q=CCO&limit=20'
    curl 'http://localhost:8787/api/catalog/search?q=CID%202244'
    curl http://localhost:8787/api/catalog/compound/2244

The query API enforces limits. The browse response's nextAfter value
is an integer CID cursor, not a slow offset/skip through the dataset.

## Technical design

| Layer | Behavior |
| --- | --- |
| Import | Streaming gzip reader, CID/SMILES validation, 5,000-row SQLite batches |
| Storage | SQLite with CID primary key and SMILES B-tree |
| Search | Indexed CID and SMILES prefix, bounded results |
| Browsing | CID keyset pagination, never 500k React state |
| HTTP | Read-only better-sqlite3 with database replacement detection |
| React | Small pages; no mass JSON or WebGL rendering |
| Integrity | Atomic SQLite promotion, source metadata, timestamp and digest |
| Reaction algorithms | Existing C++ CSR graph; no invented chemical edges |

Until the import succeeds, the UI correctly displays **Not installed**,
rather than claiming 500,000 compounds already exist. The C++ graph's
stats.compounds count continues to describe reaction-network compounds,
not unrelated PubChem structure records.

## Tests and evidence

    node scripts/test-pubchem-catalog.mjs
    npm run verify:release

An offline CID-SMILES fixture checks the SQLite indexes, cursor paging,
REST API, and safe rollback when an import source is incomplete.
Offline fixtures are never represented as the actual full dataset.

The optional GitHub Actions PubChem build uses the real public source,
requires exactly 500,000 rows, runs a database integrity check and
publishes its SQLite result as an artifact.

## Scientific and source limitations

- PubChem CIDs are source identifiers; this minimal data snapshot
  does not invent compound common names or formulae.
- SMILES are kept as supplied; no structure validation or
  molecular canonicalization is performed by this importer.
- Download data and PubChem metadata can change across upstream releases;
  source URL, import timestamp and an input digest are recorded.
- Most added compounds have no curated reaction edges and cannot be
  routed through using only the default reaction graph.
- The PubChem/NLM data-download terms and individual contributor terms
  apply: https://pubchem.ncbi.nlm.nih.gov/docs/downloads
