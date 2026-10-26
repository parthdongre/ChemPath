# Full Open Reaction Database integration

## Dataset and attribution

- Primary upstream: https://github.com/open-reaction-database/ord-data
- Download mirror: https://huggingface.co/datasets/open-reaction-database/ord-data
- ORD source dataset license: **CC BY-SA 4.0**, separate from ChemPath's
  software license, independent from the curated teaching CSV and Rhea data.
- Scholarly attribution: Kearnes et al., *The Open Reaction Database*,
  Journal of the American Chemical Society (2021),
  https://doi.org/10.1021/jacs.1c09820.

The upstream repository offers Parquet files containing serialized Protobuf
Reaction messages. ChemPath imports those files in fixed-size batches using
PyArrow + ord-schema, **not by loading the entire source into RAM**.

Upstream record counts, content and file inventory may change between runs.
The web UI shows the number **actually imported into the current local SQLite
index**, not the catalog's advertised size. The importer handles duplicate
ORD identifiers with a unique database constraint. Rows missing a usable
reaction SMILES are retained as identifiers but cannot participate in
SMILES-based search/network exploration.

## MacBook Air M4 setup

Required: Python 3.11–3.13 recommended, 64-bit Python, Git, CMake, Node/npm
and enough available disk space. A full multi-million-record SQLite import
can require several additional gigabytes beyond the compressed source files.

~~~bash
cd ~/Desktop/ChemPath-latest
git pull origin main
npm install
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/requirements-ord.txt
python scripts/import-ord.py --limit 20000
npm run dev
~~~

Visit http://localhost:5173/#ord-database. Choose **Search database**,
enter a SMILES *prefix* (e.g., \`CCO\`) or an ORD identifier (e.g., \`ord-\`),
open a reaction, and inspect its input/product participation neighborhood.

Index the full corpus on your machine:

~~~bash
python scripts/import-ord.py --all
~~~

Run with an externally downloaded Parquet file:

~~~bash
python scripts/import-ord.py --source-file /path/to/ord_dataset-example.parquet --limit 20000
~~~

The standard importer uses Hugging Face Hub's local cache under
\`data/ord/cache/\`, and writes \`data/ord/ord.sqlite\` plus SQLite transient
\`-wal\`/\`-shm\` files. The files are excluded from Git. You can change locations:

~~~bash
python scripts/import-ord.py --all --db /path/to/ord.sqlite --cache-dir /path/to/cache
CHEMPATH_ORD_DB=/path/to/ord.sqlite npm run dev
~~~

### Export a playable graph for C++ DSA algorithms

~~~bash
python scripts/export-ord-graph.py --db data/ord/ord.sqlite --limit 10000
CHEMPATH_DATA_DIR=data/ord-demo npm run dev
~~~

This produces \`compounds.csv\`, \`reactions.csv\` and license attribution in
\`data/ord-demo/\`. The export **does not modify** \`data/compounds.csv\` or
\`data/reactions.csv\`.

The legacy C++ graph algorithms work on these **bounded exported paths**;
they cannot execute BFS over every reaction in the disk-backed multimillion
source corpus. Scaling that search to the entire database would require a
separate indexed graph engine and careful reaction constraint modeling.

## REST API

- \`GET /api/ord/status\`: availability, actual reaction count, structural
  records, and source-file count. Works even before installation.
- \`GET /api/ord/search?q=CCO&limit=20\`: exact *prefix* match on stored
  participant SMILES, not a chemical substructure match or name search.
- \`GET /api/ord/search?q=ord-&limit=20\`: ORD reaction-ID prefix.
- \`GET /api/ord/reaction/123\`: one stored record and its participants.
- \`GET /api/ord/neighborhood?smiles=CCO&limit=28\`: at most 80 related
  reaction records, in a bounded bipartite compound–reaction graph.

The browser does not fetch a giant CSV or WebGL network. The Node service
uses read-only SQLite via \`better-sqlite3\` with parameterized queries and
bounded result sets. The SQLite importer operates as a separate process,
so existing HTTP requests are not blocked by downloading Parquet.

## Meaning and caveats

ORD inputs have reactants, agents and products. ChemPath's ORD explorer
preserves distinct **reaction nodes** so all participants remain visible.
An apparent connection is *not* a claim that a compound alone can create
the product. Conditions, temperature, evidence, yields and co-reactant
availability are not evaluated by the ORD C++ graph export.

For fast import, structural identifiers have atom map numbers stripped,
but undergo **no RDKit canonicalization** here. The database supports
textual SMILES-prefix search, *not* structure-equivalence, substructure
search, name lookup, or molecular formula filters. Reaction records from
different upstream sources may still be duplicated in chemical meaning;
only identical ORD IDs are deduplicated.

The current public-hosting Docker image intentionally excludes local
ORD SQLite files and Hugging Face caches. To host your personal local ORD
database, mount it as persistent storage, e.g.:

~~~bash
docker run --rm -p 8080:8080 \
  -e CHEMPATH_ORD_DB=/mnt/ord/ord.sqlite \
  -v "$(pwd)/data/ord:/mnt/ord:ro" chempath
~~~

For an actual public deployment, use external persistent storage and restrict
access/computation. This integration does **not** upload your locally generated
database automatically to Railway, nor silently import several gigabytes on
each container restart.
