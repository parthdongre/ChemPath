// Formula parsing and chemistry-class filters used by compound pickers and the directory.

export const CHEMISTRY_CENTERS = [
  "All",
  "Carbon",
  "Nitrogen",
  "Sulfur",
  "Phosphorus",
  "Halogen",
  "Metal",
  "Oxygen",
  "Other"
];

export const METAL_ELEMENTS = new Set([
  "Li",
  "Na",
  "K",
  "Rb",
  "Cs",
  "Be",
  "Mg",
  "Ca",
  "Sr",
  "Ba",
  "Al",
  "Fe",
  "Cu",
  "Zn",
  "Ag",
  "Mn",
  "Co",
  "Ni",
  "Cr",
  "Sn",
  "Pb"
]);

export const HALOGEN_ELEMENTS = new Set(["F", "Cl", "Br", "I"]);

export function formulaElements(formula) {
  const elements = [];
  const seen = new Set();

  for (const match of String(formula ?? "").matchAll(/[A-Z][a-z]?/g)) {
    const symbol = match[0];
    if (!seen.has(symbol)) {
      seen.add(symbol);
      elements.push(symbol);
    }
  }

  return elements;
}

export function chemistryCenter(compound) {
  const elements = formulaElements(compound.formula);
  const has = symbol => elements.includes(symbol);

  // This is a browsing classification, not a claim about molecular geometry.
  if (has("C")) return "Carbon";
  if (has("N")) return "Nitrogen";
  if (has("S")) return "Sulfur";
  if (has("P")) return "Phosphorus";
  if (elements.some(symbol => HALOGEN_ELEMENTS.has(symbol))) return "Halogen";
  if (elements.some(symbol => METAL_ELEMENTS.has(symbol))) return "Metal";
  if (has("O")) return "Oxygen";
  return "Other";
}

export function matchesChemistryCenter(compound, center) {
  if (!center || center === "All") return true;

  const elements = formulaElements(compound.formula);
  const has = symbol => elements.includes(symbol);

  if (center === "Carbon") return has("C");
  if (center === "Nitrogen") return has("N");
  if (center === "Sulfur") return has("S");
  if (center === "Phosphorus") return has("P");
  if (center === "Halogen") {
    return elements.some(symbol => HALOGEN_ELEMENTS.has(symbol));
  }
  if (center === "Metal") {
    return elements.some(symbol => METAL_ELEMENTS.has(symbol));
  }
  if (center === "Oxygen") return has("O");

  return !(
    has("C") ||
    has("N") ||
    has("S") ||
    has("P") ||
    has("O") ||
    elements.some(symbol => HALOGEN_ELEMENTS.has(symbol)) ||
    elements.some(symbol => METAL_ELEMENTS.has(symbol))
  );
}

export function relationshipLabel(compound, from, distanceByName) {
  if (!from) return "";
  if (compound.name === from) return "Start";
  const hops = distanceByName?.[compound.name];
  if (!Number.isFinite(hops)) return "—";
  return `${hops} ${hops === 1 ? "step" : "steps"}`;
}
