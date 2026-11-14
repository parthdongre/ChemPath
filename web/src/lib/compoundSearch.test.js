import { describe, expect, test } from "vitest";
import {
  compoundAliases,
  compoundSearchScore,
  normalizeSearch,
  rankedCompounds,
  subsequenceScore
} from "./compoundSearch.js";

const compounds = [
  { name: "Methane", formula: "CH4", category: "Organic" },
  { name: "Methanol", formula: "CH3OH", category: "Organic" },
  { name: "Acetic Acid", formula: "CH3COOH", category: "Acid" },
  { name: "Sodium Chloride", formula: "NaCl", category: "Salt" },
  { name: "Water", formula: "H2O", category: "Inorganic" },
  { name: "Sodium Acetate", formula: "CH3COONa", category: "Salt" }
];
const names = list => list.map(c => c.name);

test("normalizeSearch lowercases, strips punctuation and maps superscripts", () => {
  expect(normalizeSearch("  Acetic-Acid ")).toBe("aceticacid");
  expect(normalizeSearch("CO²")).toBe("co2");
  expect(normalizeSearch(null)).toBe("");
});

test("subsequenceScore rewards tight matches and rejects missing letters", () => {
  // Fewer skipped letters between matches scores higher.
  expect(subsequenceScore("methane", "mth")).toBeGreaterThan(subsequenceScore("methane", "mae"));
  expect(subsequenceScore("methane", "xyz")).toBe(-1);
  expect(subsequenceScore("methane", "")).toBe(0);
});

test("compoundAliases adds IUPAC acetate names", () => {
  expect(compoundAliases({ name: "Sodium Acetate" })).toContain("Sodium Ethanoate");
  expect(compoundAliases({ name: "Acetic Acid" })).toContain("Ethanoic Acid");
});

describe("compoundSearchScore", () => {
  test("exact > prefix > substring", () => {
    const methane = compounds[0];
    expect(compoundSearchScore(methane, "methane")).toBe(1200);
    const prefix = compoundSearchScore(methane, "meth");
    const middle = compoundSearchScore(methane, "than");
    expect(prefix).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(0);
  });
  test("finds compounds by formula, alias and element name", () => {
    expect(compoundSearchScore(compounds[4], "H2O")).toBe(1200);
    expect(compoundSearchScore(compounds[2], "ethanoic")).toBeGreaterThan(900);
    expect(compoundSearchScore(compounds[3], "sodium")).toBeGreaterThan(900);
  });
  test("returns -1 when nothing matches", () => {
    expect(compoundSearchScore(compounds[4], "zzz")).toBe(-1);
  });
});

describe("rankedCompounds", () => {
  test("empty query sorts alphabetically", () => {
    expect(names(rankedCompounds(compounds, " "))).toEqual(
      [...names(compounds)].sort((a, b) => a.localeCompare(b))
    );
  });
  test("best match first and non-matches dropped", () => {
    const result = names(rankedCompounds(compounds, "methan"));
    expect(result.slice(0, 2)).toEqual(["Methane", "Methanol"]);
    expect(result).not.toContain("Sodium Chloride");
  });
  test("ties break alphabetically", () => {
    expect(names(rankedCompounds(compounds, "sodium")).slice(0, 2)).toEqual([
      "Sodium Acetate",
      "Sodium Chloride"
    ]);
  });
});
