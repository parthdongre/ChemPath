import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const reactionsPath = path.join(root, "data", "reactions.csv");
const rows = fs.readFileSync(reactionsPath, "utf8").trim().split("\n");

const header = rows.shift()?.split("|") ?? [];
const expectedHeader = [
  "id","name","reactants","products","equation","conditions",
  "reversible","note","source","cost"
];

if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
  throw new Error(
    `Unexpected reactions.csv header. Expected ${expectedHeader.join("|")}`
  );
}

const allowedSources = new Set([
  "S1_COMBUSTION",
  "S2_HYDROGENATION",
  "S3_HYDROBORATION_OXIDATION",
  "S4_ALCOHOL_OXIDATION",
  "S5_NITRILE_HYDROLYSIS",
  "S6_FISCHER_ESTERIFICATION",
  "S7_AMINE_BASICITY",
  "S8_SOLUBILITY_PRECIPITATION",
  "S9_NUCLEOPHILIC_SUBSTITUTION",
  "S10_ACID_BASE_EQUILIBRIA",
  "S11_GENERAL_INORGANIC",
  "S12_CARBOHYDRATE_HYDROLYSIS",
  "S13_PEPTIDE_COUPLING",
  "S14_NETWORK_BRIDGES",
  "S15_ESTER_LIBRARY"
]);

const banned = [
  /alkylamine.*ammonium$/i,
  /aniline.*ammonium$/i,
  /benzaldehyde.*benzene/i,
  /chlor.*combustion/i,
  /sulfate protonation/i,
  /hydrogen peroxide formation/i,
  /methane partial oxidation/i
];

function parseFormula(rawFormula) {
  let formula = rawFormula.trim();

  formula = formula
    .replace(/\((?:aq|s|l|g)\)$/i, "")
    .trim();

  let charge = 0;
  const explicitCharge = formula.match(/\^(\d+)([+-])$/);
  if (explicitCharge) {
    charge = Number(explicitCharge[1]) * (explicitCharge[2] === "+" ? 1 : -1);
    formula = formula.slice(0, explicitCharge.index);
  } else {
    const unitCharge = formula.match(/([+-])$/);
    if (unitCharge) {
      charge = unitCharge[1] === "+" ? 1 : -1;
      formula = formula.slice(0, -1);
    }
  }

  let index = 0;

  function readNumber() {
    let digits = "";
    while (index < formula.length && /\d/.test(formula[index])) {
      digits += formula[index];
      index += 1;
    }
    return digits ? Number(digits) : 1;
  }

  function merge(target, source, multiplier = 1) {
    for (const [element, count] of Object.entries(source)) {
      target[element] = (target[element] ?? 0) + count * multiplier;
    }
  }

  function readGroup(stopAtParen = false) {
    const atoms = {};

    while (index < formula.length) {
      const ch = formula[index];

      if (ch === ")") {
        if (!stopAtParen) {
          throw new Error(`Unexpected ')' in formula ${rawFormula}`);
        }
        index += 1;
        return atoms;
      }

      if (ch === "(") {
        index += 1;
        const inner = readGroup(true);
        const multiplier = readNumber();
        merge(atoms, inner, multiplier);
        continue;
      }

      if (!/[A-Z]/.test(ch)) {
        throw new Error(
          `Unsupported token '${ch}' in formula ${rawFormula}`
        );
      }

      let element = ch;
      index += 1;

      if (index < formula.length && /[a-z]/.test(formula[index])) {
        element += formula[index];
        index += 1;
      }

      const count = readNumber();
      atoms[element] = (atoms[element] ?? 0) + count;
    }

    if (stopAtParen) {
      throw new Error(`Unclosed '(' in formula ${rawFormula}`);
    }

    return atoms;
  }

  const atoms = readGroup(false);
  return { atoms, charge };
}

function parseTerm(rawTerm) {
  let term = rawTerm.trim();
  let coefficient = 1;

  const match = term.match(/^(\d+)\s+(.+)$/);
  if (match) {
    coefficient = Number(match[1]);
    term = match[2].trim();
  }

  return { coefficient, formula: parseFormula(term) };
}

function totalSide(side) {
  const atoms = {};
  let charge = 0;

  for (const part of side.split(" + ")) {
    const { coefficient, formula } = parseTerm(part);

    for (const [element, count] of Object.entries(formula.atoms)) {
      atoms[element] = (atoms[element] ?? 0) + count * coefficient;
    }

    charge += formula.charge * coefficient;
  }

  return { atoms, charge };
}

function sameAtoms(left, right) {
  const keys = new Set([
    ...Object.keys(left),
    ...Object.keys(right)
  ]);

  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) return false;
  }
  return true;
}

let balanced = 0;
let schemesSkipped = 0;

rows.forEach((line, rowIndex) => {
  const cols = line.split("|");

  if (cols.length !== 10) {
    throw new Error(
      `Row ${rowIndex + 2} has ${cols.length} columns instead of 10`
    );
  }

  const [
    id,name,reactants,products,equation,conditions,
    reversible,note,source,cost
  ] = cols;

  if (Number(id) !== rowIndex) {
    throw new Error(
      `Reaction IDs must be sequential. Row ${rowIndex + 2} has id ${id}`
    );
  }

  for (const [label, value] of Object.entries({
    name,reactants,products,equation,conditions,note,source,cost
  })) {
    if (!value.trim()) {
      throw new Error(`Reaction ${id} (${name}) is missing ${label}`);
    }
  }

  if (!["true","false"].includes(reversible)) {
    throw new Error(
      `Reaction ${id} (${name}) has invalid reversible flag ${reversible}`
    );
  }

  if (!allowedSources.has(source)) {
    throw new Error(
      `Reaction ${id} (${name}) has unknown source key ${source}`
    );
  }

  const signature = `${name} ${reactants} ${products}`;
  if (banned.some((pattern) => pattern.test(signature))) {
    throw new Error(
      `Known misleading chemistry pattern found in reaction ${id}: ${name}`
    );
  }

  if (!Number.isFinite(Number(cost)) || Number(cost) <= 0) {
    throw new Error(
      `Reaction ${id} (${name}) has invalid graph weight ${cost}`
    );
  }

  // [O] is a conventional oxidizing-equivalent notation rather than a
  // literal species. Hydroboration entries are stored as reaction schemes
  // because the multi-step reagents are kept in the conditions field.
  const schematic =
    equation.includes("[O]") ||
    source === "S3_HYDROBORATION_OXIDATION";

  if (schematic) {
    schemesSkipped += 1;
    return;
  }

  const arrow = equation.includes("⇌") ? "⇌" : "→";
  const parts = equation.split(arrow);

  if (parts.length !== 2) {
    throw new Error(
      `Reaction ${id} (${name}) has an unsupported equation: ${equation}`
    );
  }

  const left = totalSide(parts[0]);
  const right = totalSide(parts[1]);

  if (!sameAtoms(left.atoms, right.atoms) || left.charge !== right.charge) {
    throw new Error(
      [
        `Unbalanced equation in reaction ${id}: ${name}`,
        equation,
        `Left atoms: ${JSON.stringify(left.atoms)} charge=${left.charge}`,
        `Right atoms: ${JSON.stringify(right.atoms)} charge=${right.charge}`
      ].join("\n")
    );
  }

  balanced += 1;
});

console.log(
  `Chemistry audit passed: ${rows.length} reactions, ` +
  `${balanced} atom/charge-balanced equations, ` +
  `${schemesSkipped} explicitly marked reaction schemes.`
);
