#!/usr/bin/env python3
"""Build an attributed, capped Rhea reaction-graph sample from official TSV.

The validated 690-compound teaching dataset remains unchanged. This script
builds a separate *reaction-participation* graph for graph-algorithm scaling,
not an experimentally feasible synthesis planner.
"""
import argparse
import csv
import hashlib
import io
from pathlib import Path
import urllib.request

from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

SOURCE = "https://ftp.expasy.org/databases/rhea/tsv/rhea-reaction-smiles.tsv"
ROOT = Path(__file__).resolve().parents[1]
COMPOUND_HEADER = ["id", "name", "formula", "category"]
REACTION_HEADER = ["id", "name", "reactants", "products", "equation",
                   "conditions", "reversible", "note", "source", "cost"]


def canonical(raw):
    if not raw or len(raw) > 220 or "|" in raw:
        return None
    mol = Chem.MolFromSmiles(raw)
    if mol is None:
        return None
    # Atom mapping is provenance, not part of the compound identity.
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    key = Chem.MolToSmiles(mol, isomericSmiles=True)
    if not key or len(key) > 160 or "|" in key:
        return None
    return key, rdMolDescriptors.CalcMolFormula(mol)


def load_rows(file, header):
    with file.open(encoding="utf-8", newline="") as stream:
        reader = csv.reader(stream, delimiter="|")
        first = next(reader)
        if first != header:
            raise ValueError("Unexpected existing header in " + str(file))
        return list(reader)


def write_rows(file, header, rows):
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="|", lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=1500)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "expanded")
    args = parser.parse_args()
    if not 1 <= args.limit <= 15000:
        parser.error("limit must be between 1 and 15000")

    base_compounds = load_rows(ROOT / "data" / "compounds.csv", COMPOUND_HEADER)
    base_reactions = load_rows(ROOT / "data" / "reactions.csv", REACTION_HEADER)
    compounds = list(base_compounds)
    reactions = list(base_reactions)
    compounds_by_name = {row[1].lower(): int(row[0]) for row in compounds}
    imported_names = set()
    imported_reactions = set()

    def get_compound(smiles):
        key, formula = smiles
        name = "RHEA:" + key
        if name.lower() not in compounds_by_name:
            identifier = len(compounds)
            compounds_by_name[name.lower()] = identifier
            compounds.append([str(identifier), name, formula, "Biochemical"])
            imported_names.add(name)
        return name

    request = urllib.request.Request(SOURCE, headers={"User-Agent": "ChemPath-DSA-Importer/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
    sha256 = hashlib.sha256(raw).hexdigest()
    stream = io.StringIO(raw.decode("utf-8-sig"))
    skipped = 0

    for row in csv.reader(stream, delimiter="\t"):
        if len(reactions) - len(base_reactions) >= args.limit:
            break
        if len(row) < 2:
            skipped += 1
            continue
        rhea_id = row[0].strip()
        reaction_smiles = row[1].strip()
        if ">>" not in reaction_smiles or rhea_id.lower() in {"rhea_id", "rhea-id", "id"}:
            skipped += 1
            continue
        sides = reaction_smiles.split(">>")
        if len(sides) != 2:
            skipped += 1
            continue
        reactants_raw = sides[0].split(".")
        products_raw = sides[1].split(".")
        if (not reactants_raw or not products_raw or len(reactants_raw) > 8
                or len(products_raw) > 8):
            skipped += 1
            continue
        reactants = [canonical(x) for x in reactants_raw]
        products = [canonical(x) for x in products_raw]
        if any(x is None for x in reactants + products):
            skipped += 1
            continue
        # Avoid duplicates across Rhea directional identifiers.
        fingerprint = (tuple(x[0] for x in reactants), tuple(x[0] for x in products))
        if fingerprint in imported_reactions:
            continue
        imported_reactions.add(fingerprint)
        reactant_names = list(dict.fromkeys(get_compound(x) for x in reactants))
        product_names = list(dict.fromkeys(get_compound(x) for x in products))
        equation = " + ".join(x[1] for x in reactants) + " → " + " + ".join(x[1] for x in products)
        # The old graph projects each reactant to each product; co-reactants
        # are assumed present. This is NOT a complete synthesis model.
        reactions.append([
            str(len(reactions)), "Rhea reaction " + rhea_id,
            ";".join(reactant_names), ";".join(product_names), equation,
            "Biochemical conditions and cofactors must be checked in Rhea",
            "false", "Source: https://www.rhea-db.org/rhea/" + rhea_id + " | Rhea CC BY 4.0".replace("|", "/"),
            "RHEA_CC_BY_4_0", "1"
        ])
    if len(reactions) == len(base_reactions):
        raise RuntimeError("No Rhea records imported; inspect the upstream TSV schema.")

    args.output.mkdir(parents=True, exist_ok=True)
    write_rows(args.output / "compounds.csv", COMPOUND_HEADER, compounds)
    write_rows(args.output / "reactions.csv", REACTION_HEADER, reactions)
    provenance = (
        "# Expanded graph dataset (Rhea subset)\n\n"
        "Original curated ChemPath data is retained and supplemented by a bounded subset "
        "of Rhea's directed reaction SMILES. The original ChemPath custom license "
        "does not override Rhea's attribution requirements.\n\n"
        "Source: " + SOURCE + "\n"
        "License (Rhea additions): CC BY 4.0; https://www.rhea-db.org/help/license\n"
        "Rhea data credit: Rhea reaction knowledgebase, SIB Swiss Institute of Bioinformatics.\n"
        "Raw upstream SHA256: " + sha256 + "\n\n"
        "Imported reaction records: " + str(len(reactions) - len(base_reactions)) + "\n"
        "Imported compound structures: " + str(len(imported_names)) + "\n"
        "Total compounds: " + str(len(compounds)) + "\n"
        "Total reactions: " + str(len(reactions)) + "\n"
        "Skipped records during parsing: " + str(skipped) + "\n\n"
        "ChemPath reaction-participation projection makes co-reactants implicitly "
        "available. Graph routes are DSA demonstrations, **not** verified syntheses. "
        "Rhea SMILES are normalized with RDKit, but organic reaction outcomes and "
        "stoichiometry are not independently laboratory-validated here.\n"
        "\nUse locally with CHEMPATH_DATA_DIR=data/expanded npm run dev (after building the engine).\n"
    )
    (args.output / "SOURCES.md").write_text(provenance, encoding="utf-8")
    print("Wrote", len(compounds), "compounds and", len(reactions), "reactions")
    print("Imported", len(reactions) - len(base_reactions), "Rhea reactions")


if __name__ == "__main__":
    main()
