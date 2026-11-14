// Fuzzy compound search: names, aliases, element names, formulas and classes.
import { chemistryCenter, formulaElements } from "./chemistry.js";

export const ELEMENT_SEARCH_NAMES = {
  C: "carbon",
  N: "nitrogen",
  S: "sulfur sulphur",
  P: "phosphorus",
  O: "oxygen",
  H: "hydrogen",
  F: "fluorine fluoride halogen",
  Cl: "chlorine chloride halogen",
  Br: "bromine bromide halogen",
  I: "iodine iodide halogen",
  Na: "sodium metal",
  K: "potassium metal",
  Li: "lithium metal",
  Mg: "magnesium metal",
  Ca: "calcium metal",
  Fe: "iron metal",
  Cu: "copper metal",
  Zn: "zinc metal",
  Ag: "silver metal"
};

export const COMPOUND_ALIASES = {
  "Acetic Acid": ["Ethanoic Acid"],
  "Methanoic Acid": ["Formic Acid"],
  Formaldehyde: ["Methanal"],
  Acetaldehyde: ["Ethanal"],
  Acetone: ["Propanone"],
  Bicarbonate: ["Hydrogen Carbonate"],
  "Hydrogen Carbonate": ["Bicarbonate"],
  "Carbon Dioxide": ["CO2"],
  "Carbon Monoxide": ["CO"],
  "Sulfur Dioxide": ["SO2"],
  "Sulfur Trioxide": ["SO3"],
  "Nitric Oxide": ["NO"],
  "Nitrogen Dioxide": ["NO2"],
  Water: ["H2O"],
  Ammonia: ["NH3"],
  Ammonium: ["NH4+"]
};

export function normalizeSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, digit => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit))
    .replace(/[^a-z0-9]+/g, "");
}

export function compoundAliases(compound) {
  const aliases = [...(COMPOUND_ALIASES[compound.name] ?? [])];

  if (compound.name.includes("Acetate")) {
    aliases.push(compound.name.replace("Acetate", "Ethanoate"));
  }

  return aliases;
}

export function subsequenceScore(text, query) {
  if (!query) return 0;

  let cursor = 0;
  let gaps = 0;
  for (const char of query) {
    const next = text.indexOf(char, cursor);
    if (next < 0) return -1;
    gaps += next - cursor;
    cursor = next + 1;
  }

  return Math.max(1, 180 - gaps);
}

export function compoundSearchScore(compound, query) {
  const needle = normalizeSearch(query);
  if (!needle) return 0;

  const name = normalizeSearch(compound.name);
  const formula = normalizeSearch(compound.formula);
  const category = normalizeSearch(compound.category);
  const center = normalizeSearch(chemistryCenter(compound));
  const elements = formulaElements(compound.formula);
  const elementTerms = elements.flatMap(symbol => [
    normalizeSearch(symbol),
    normalizeSearch(ELEMENT_SEARCH_NAMES[symbol] ?? symbol)
  ]);
  const aliases = compoundAliases(compound).map(normalizeSearch);
  const values = [name, formula, category, center, ...elementTerms, ...aliases];

  let best = -1;

  for (const value of values) {
    if (!value) continue;
    if (value === needle) best = Math.max(best, 1200);
    else if (value.startsWith(needle))
      best = Math.max(best, 950 - Math.min(100, value.length - needle.length));
    else if (value.includes(needle))
      best = Math.max(best, 700 - Math.min(150, value.indexOf(needle)));

    const fuzzy = subsequenceScore(value, needle);
    if (fuzzy >= 0) best = Math.max(best, fuzzy);
  }

  return best;
}

export function rankedCompounds(compounds, query) {
  if (!query.trim()) {
    return [...compounds].sort((left, right) => left.name.localeCompare(right.name));
  }

  return compounds
    .map(compound => ({ compound, score: compoundSearchScore(compound, query) }))
    .filter(entry => entry.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.compound.name.localeCompare(right.compound.name)
    )
    .map(entry => entry.compound);
}
