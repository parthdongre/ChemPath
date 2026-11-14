import { formulaParts, isStructureRecord } from "../theme.js";

/**
 * Chemical formula with real subscripts and charges (HCO₃⁻, SO₄²⁻).
 * SMILES identifiers from ORD/Rhea records are shown verbatim.
 */
export default function Formula({ value, compound, className = "" }) {
  const text = value ?? compound?.formula ?? compound?.name ?? "";
  if (!text) return <span className={"formula " + className}>—</span>;
  const raw = compound && isStructureRecord(compound);
  const parts = raw ? [{ kind: "text", value: text }] : formulaParts(text);
  return <span className={"formula " + className} title={text}>
    {parts.map((part, index) =>
      part.kind === "sub" ? <sub key={index}>{part.value}</sub> :
      part.kind === "sup" ? <sup key={index}>{part.value}</sup> :
      <span key={index}>{part.value}</span>)}
  </span>;
}
