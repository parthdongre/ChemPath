# Legacy PubChem 500,000-compound option

ChemPath now defaults to **8,000,000** real PubChem CID–SMILES records.
The 500k installer remains available for smaller machines:

```bash
npm run data:500k
```

This command never downgrades an existing 8M or full-corpus installation.
To upgrade from 500k to the recommended default, run:

```bash
npm run data:8m
```

The importer verifies the larger catalog before replacing the original;
interrupted upgrades preserve your existing data.

For complete installation commands, the full-corpus option, SQLite
architecture, path troubleshooting and the scientific distinction between
PubChem structures and reaction edges, see [PubChem catalog guide](PUBCHEM_CATALOG.md).
