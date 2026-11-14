import { createContext, useContext } from "react";

/**
 * Shared visual tokens for the canvas renderers (Sigma, Cytoscape, lens).
 * CSS custom properties cover the DOM; WebGL and canvas drawing need the
 * same values in JavaScript, so they live here once.
 */
export const ThemeContext = createContext("dark");
export const useTheme = () => useContext(ThemeContext);

const CATEGORY = {
  dark: {
    organic: "#8cc084", acid: "#e8806f", ion: "#6aa9e0", biochemical: "#c991c9",
    salt: "#a8a29e", base: "#9d8fe0", inorganic: "#5fbfb0", reaction: "#e0b25a",
    scc: "#6aa9e0", other: "#8a8f98"
  },
  light: {
    organic: "#4f8a45", acid: "#c4513f", ion: "#2f74b5", biochemical: "#9b4f9b",
    salt: "#78716c", base: "#6a5acd", inorganic: "#2a8a7d", reaction: "#a8741a",
    scc: "#2f74b5", other: "#6b7079"
  }
};

export const GRAPH = {
  dark: {
    canvas: "#0b0c0e",
    label: "#c9cacb",
    edgeArterial: "#3d4048", edgeCollector: "#2e3137", edgeLocal: "#25282d",
    edgeMuted: "#1c1e22", route: "#f59e3b",
    nodeMuted: "#3a3d44", selected: "#f4f4f2", active: "#ffd166", visited: "#c48a4c",
    lensBg: "#111215", lensLabel: "#ececea",
    hoverBg: "#1c1d21", hoverInk: "#f4f4f2", hoverLine: "#3a3d44"
  },
  light: {
    canvas: "#f1f0ec",
    label: "#3a3833",
    edgeArterial: "#bdb9b0", edgeCollector: "#cfcbc3", edgeLocal: "#dcd9d2",
    edgeMuted: "#e6e3dd", route: "#d9730d",
    nodeMuted: "#cfccc5", selected: "#1b1a17", active: "#b45309", visited: "#c58a4a",
    lensBg: "#fbfaf8", lensLabel: "#1b1a17",
    hoverBg: "#ffffff", hoverInk: "#1b1a17", hoverLine: "#c9c5bc"
  }
};

export function graphTheme(theme) {
  return GRAPH[theme] || GRAPH.dark;
}

export function categoryColor(theme, category) {
  const table = CATEGORY[theme] || CATEGORY.dark;
  return table[String(category || "").toLowerCase()] || table.other;
}

const ELEMENT_PAIRS = /Cl|Br|Na|Mg|Al|Si|Ca|Fe|Cu|Zn|Ag|Li|Ba|Mn|Co|Ni|Cr|Sn|Pb|Sr|Rb|Cs|Be|He|Ne|Ar|Kr|Xe|Se|Te|As|Sb|Bi|Hg|Au|Pt|Pd|Ti|Ga|Ge/g;

/** SMILES strings (ORD/Rhea structure identifiers) must never be subscripted. */
export function looksLikeSmiles(value) {
  const text = String(value || "");
  if (/[=#@[\]/\\%.]/.test(text)) return true;
  return /[a-z]/.test(text.replace(ELEMENT_PAIRS, ""));
}

/**
 * Split a molecular formula such as "HCO3-", "SO4^2-" or "Al(OH)3" into
 * normal / subscript / superscript runs. Unknown notations pass through.
 */
export function formulaParts(formula) {
  const text = String(formula ?? "");
  if (!text || looksLikeSmiles(text)) return [{ kind: "text", value: text }];
  let body = text;
  let charge = "";
  const caret = /\^(\d*[+-])$/.exec(body);
  const trailingCount = /[A-Za-z0-9)\]*]([+-])(\d+)$/.exec(body);
  if (caret) {
    charge = caret[1];
    body = body.slice(0, caret.index);
  } else if (trailingCount) {
    // Rhea style "C7H11NO9P-2" means a 2− charge.
    charge = trailingCount[2] + trailingCount[1];
    body = body.slice(0, body.length - trailingCount[0].length + 1);
  } else if (/[A-Za-z0-9)\]][+-]$/.test(body)) {
    charge = body.slice(-1);
    body = body.slice(0, -1);
  }
  const parts = [];
  const push = (kind, value) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.value += value;
    else parts.push({ kind, value });
  };
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    const previous = body[i - 1];
    const isSubscript = /\d/.test(char) && previous && /[A-Za-z)\]\d]/.test(previous) &&
      !(/\d/.test(previous) && parts[parts.length - 1]?.kind !== "sub");
    push(isSubscript ? "sub" : "text", char);
  }
  if (charge) push("sup", charge.replace("-", "−"));
  return parts;
}

const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "−": "⁻" };

/** Unicode rendition for canvas/SVG labels where <sub> is unavailable. */
export function formulaText(formula) {
  return formulaParts(formula).map(({ kind, value }) =>
    kind === "sub" ? [...value].map((c) => SUB[c] ?? c).join("") :
    kind === "sup" ? [...value].map((c) => SUP[c] ?? c).join("") : value
  ).join("");
}

/** ORD/Rhea records carry SMILES identifiers in their name; show those verbatim. */
export function isStructureRecord(compound) {
  const name = String(compound?.name || "");
  return name.startsWith("SMILES:") || /ORD molecule/i.test(String(compound?.category || ""));
}

export function compoundLabel(compound) {
  if (!compound) return "";
  const formula = compound.formula || compound.name || "";
  return isStructureRecord(compound) ? formula : formulaText(formula);
}
