import { describe, expect, test } from "vitest";
import {
  chemistryCenter,
  formulaElements,
  matchesChemistryCenter,
  relationshipLabel
} from "./chemistry.js";

describe("formulaElements", () => {
  test("lists each element once, in order of appearance", () => {
    expect(formulaElements("CH3COOH")).toEqual(["C", "H", "O"]);
    expect(formulaElements("NaCl")).toEqual(["Na", "Cl"]);
  });
  test("handles charges, subscripts and missing formulas", () => {
    expect(formulaElements("HCO3⁻")).toEqual(["H", "C", "O"]);
    expect(formulaElements(undefined)).toEqual([]);
  });
});

describe("chemistryCenter", () => {
  test.each([
    ["CH4", "Carbon"],
    ["NH3", "Nitrogen"],
    ["H2SO4", "Sulfur"],
    ["H3PO4", "Phosphorus"],
    ["HCl", "Halogen"],
    ["NaOH", "Metal"],
    ["H2O", "Oxygen"],
    ["H2", "Other"]
  ])("%s is %s", (formula, center) => {
    expect(chemistryCenter({ formula })).toBe(center);
  });
});

describe("matchesChemistryCenter", () => {
  test("All matches everything", () => {
    expect(matchesChemistryCenter({ formula: "H2" }, "All")).toBe(true);
  });
  test("a compound can match several centers", () => {
    const urea = { formula: "CH4N2O" };
    expect(matchesChemistryCenter(urea, "Carbon")).toBe(true);
    expect(matchesChemistryCenter(urea, "Nitrogen")).toBe(true);
    expect(matchesChemistryCenter(urea, "Metal")).toBe(false);
  });
  test("Other excludes every named class", () => {
    expect(matchesChemistryCenter({ formula: "H2" }, "Other")).toBe(true);
    expect(matchesChemistryCenter({ formula: "H2O" }, "Other")).toBe(false);
  });
});

test("relationshipLabel", () => {
  const distances = { Water: 1, Ethanol: 3 };
  expect(relationshipLabel({ name: "Methane" }, "Methane", distances)).toBe("Start");
  expect(relationshipLabel({ name: "Water" }, "Methane", distances)).toBe("1 step");
  expect(relationshipLabel({ name: "Ethanol" }, "Methane", distances)).toBe("3 steps");
  expect(relationshipLabel({ name: "Gold" }, "Methane", distances)).toBe("—");
  expect(relationshipLabel({ name: "Water" }, "", distances)).toBe("");
});
