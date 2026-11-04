"""Offline, deterministic importer tests using a synthetic Rhea-format TSV."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

IMPORTER = Path(__file__).with_name("import-rhea.py")
spec = importlib.util.spec_from_file_location("rhea_import", IMPORTER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RheaImportTests(unittest.TestCase):
    def test_full_directions_dedup_and_reproducible(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = base / "rhea-reaction-smiles.tsv"
            source.write_text(
                "RHEA_ID\tREACTION_SMILES\n"
                "10001\tCCO.O>>CC=O.O\n"
                "10002\tO.CCO>>O.CC=O\n"  # same directed transformation
                "10003\tCC=O>>CCO\n"    # opposite direction, must remain
                "10004\tC.C>>CC\n"     # stoichiometric multiplicity preserved
                "10005\tC>>CC\n"       # distinct fingerprint
                "invalid\twrong\n"
                "10006\tbad-smiles>>C\n",
                encoding="utf-8",
            )
            a = base / "a"
            b = base / "b"
            first = module.import_file(source, a, None, include_curated=False)
            second = module.import_file(source, b, None, include_curated=False)
            self.assertEqual(first, second)
            self.assertEqual(first["rhea_reactions_imported"], 4)
            self.assertEqual(first["duplicate_transformations"], 1)
            self.assertEqual(first["skipped_format"], 1)
            self.assertEqual(first["skipped_smiles"], 1)
            self.assertEqual(first["reactions_total"], 4)
            for filename in ("compounds.csv", "reactions.csv", "rhea-aliases.tsv", "manifest.json", "SOURCES.md"):
                self.assertEqual((a / filename).read_bytes(), (b / filename).read_bytes())
            with (a / "reactions.csv").open(newline="") as file:
                reactions = list(csv.reader(file, delimiter="|"))[1:]
            self.assertTrue(all(reaction[6] == "false" for reaction in reactions))
            self.assertTrue(any("CC=O" in reaction[2] and "CCO" in reaction[3] for reaction in reactions))
            self.assertEqual(len(reactions), 4)
            capped = module.import_file(source, base / "capped", 1, include_curated=False)
            self.assertEqual(capped["rhea_reactions_imported"], 1)

    def test_no_invented_reverse(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = base / "source.tsv"
            source.write_text("RHEA_ID\tREACTION_SMILES\n20001\tCCO>>CC=O\n")
            result = module.import_file(source, base / "out", None, include_curated=False)
            self.assertEqual(result["rhea_reactions_imported"], 1)
            self.assertEqual(result["reactions_total"], 1)


if __name__ == "__main__":
    unittest.main()
