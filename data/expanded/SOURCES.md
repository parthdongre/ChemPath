# Expanded graph dataset (Rhea subset)

Original curated ChemPath data is retained and supplemented by a bounded subset of Rhea's directed reaction SMILES. The original ChemPath custom license does not override Rhea's attribution requirements.

Source: https://ftp.expasy.org/databases/rhea/tsv/rhea-reaction-smiles.tsv
License (Rhea additions): CC BY 4.0; https://www.rhea-db.org/help/license
Rhea data credit: Rhea reaction knowledgebase, SIB Swiss Institute of Bioinformatics.
Raw upstream SHA256: 3e55e8f7abce42951f22a759e05457f028afd5d4c8cc7d200e59d31f750fb5e5

Imported reaction records: 1500
Imported compound structures: 1170
Total compounds: 1860
Total reactions: 2384
Skipped records during parsing: 62

ChemPath reaction-participation projection makes co-reactants implicitly available. Graph routes are DSA demonstrations, **not** verified syntheses. Rhea SMILES are normalized with RDKit, but organic reaction outcomes and stoichiometry are not independently laboratory-validated here.

Use locally with CHEMPATH_DATA_DIR=data/expanded npm run dev (after building the engine).
