# Open Reaction Database — locally indexed database

Run \`python3 scripts/import-ord.py --limit 20000\` from repository root to
create \`ord.sqlite\` here. Source files are downloaded from the official
[ORD Hugging Face mirror](https://huggingface.co/datasets/open-reaction-database/ord-data)
and cached locally under \`data/ord/cache\`.

\`ord.sqlite\`, its SQLite WAL/SHM files, and downloaded Parquet objects are
excluded from Git. Full ORD source data carries **CC BY-SA 4.0**:
https://github.com/open-reaction-database/ord-data/blob/main/LICENSE

Use \`python3 scripts/import-ord.py --all\` to import all available datasets.
To export a manageable graph for the C++ DSA algorithms, use
\`python3 scripts/export-ord-graph.py --limit 10000\` and launch with
\`CHEMPATH_DATA_DIR=data/ord-demo npm run dev\`.

The full SQLite database is indexed for search and bounded reaction-network
inspection, not loaded into the C++ in-memory graph. An exported graph uses
a reaction-participation projection and **does not prove synthesis feasibility**.
