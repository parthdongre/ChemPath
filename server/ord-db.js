// SQLite-backed Open Reaction Database API. No full-dataset graph materialization.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const defaultDb = path.resolve(process.cwd(), "data/ord/ord.sqlite");
const configuredPath = process.env.CHEMPATH_ORD_DB
  ? path.resolve(process.env.CHEMPATH_ORD_DB) : defaultDb;
let opened = null;
let cachedStats = null;

function optionalDb() {
  if (opened) return opened;
  if (!fs.existsSync(configuredPath)) return null;
  const db = new Database(configuredPath, { readonly: true, fileMustExist: true, timeout: 5000 });
  db.pragma("query_only = ON");
  opened = db;
  cachedStats = null;
  return opened;
}
function failure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function positiveInteger(value, fallback, cap) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > cap)
    failure("Expected integer 1-" + cap);
  return n;
}
function sanitizeQuery(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 180 || /[\x00-\x1f]/.test(text)) {
    failure("Query must contain 2-180 printable characters");
  }
  return text;
}
const rowSummary = row => ({
  id: row.id, ordId: row.ord_id, smiles: row.reaction_smiles,
  source: row.source_file
});

export function ordStatus() {
  const db = optionalDb();
  if (!db) return {
    ok: true, available: false, source: "Open Reaction Database",
    license: "CC BY-SA 4.0", setup: "python3 scripts/import-ord.py --limit 20000"
  };
  if (!cachedStats) {
    const rows = db.prepare("SELECT COUNT(*) AS count FROM ord_reactions").get().count;
    const structures = db.prepare(
      "SELECT COUNT(*) AS count FROM ord_reactions WHERE reaction_smiles <> ''"
    ).get().count;
    const files = db.prepare("SELECT COUNT(*) AS count FROM ord_files").get().count;
    cachedStats = {
      ok: true, available: true, source: "Open Reaction Database",
      license: "CC BY-SA 4.0",
      reactions: rows, withReactionSmiles: structures, importedFiles: files,
      dbPath: path.basename(configuredPath)
    };
  }
  return cachedStats;
}
function requiredDb() {
  return optionalDb() || failure(
    "ORD database not installed. Run python3 scripts/import-ord.py --limit 20000", 503
  );
}
export function ordSearch(query, maxResults) {
  const db = requiredDb();
  const q = sanitizeQuery(query);
  const limit = positiveInteger(maxResults, 20, 50);
  const byId = q.toLowerCase().startsWith("ord-");
  const rows = byId
    ? db.prepare(
      "SELECT id, ord_id, reaction_smiles, source_file FROM ord_reactions " +
      "WHERE ord_id >= ? AND ord_id < ? ORDER BY ord_id LIMIT ?"
    ).all(q, q + "\uffff", limit)
    : db.prepare(
      "SELECT DISTINCT r.id, r.ord_id, r.reaction_smiles, r.source_file " +
      "FROM ord_participants p JOIN ord_reactions r ON r.id = p.reaction_id " +
      "WHERE p.smiles >= ? AND p.smiles < ? LIMIT ?"
    ).all(q, q + "\uffff", limit);
  return { ok: true, query: q, limit, matches: rows.map(rowSummary) };
}
export function ordReaction(recordId) {
  const db = requiredDb();
  const record = String(recordId || "").trim();
  let row;
  if (/^\d{1,12}$/.test(record)) {
    row = db.prepare(
      "SELECT id,ord_id,reaction_smiles,source_file FROM ord_reactions WHERE id = ?"
    ).get(Number(record));
  } else if (/^ord-[a-z0-9-]{3,100}$/i.test(record)) {
    row = db.prepare(
      "SELECT id,ord_id,reaction_smiles,source_file FROM ord_reactions WHERE ord_id = ?"
    ).get(record);
  } else failure("Invalid ORD reaction identifier");
  if (!row) failure("Reaction not found", 404);
  const participants = db.prepare(
    "SELECT smiles,role FROM ord_participants WHERE reaction_id = ? ORDER BY role,smiles"
  ).all(row.id);
  return { ok: true, reaction: rowSummary(row), participants };
}
export function ordNeighborhood(center, maxReactions) {
  const db = requiredDb();
  const smiles = sanitizeQuery(center);
  const limit = positiveInteger(maxReactions, 28, 80);
  const rids = db.prepare(
    "SELECT reaction_id FROM ord_participants WHERE smiles = ? LIMIT ?"
  ).all(smiles, limit).map(r => r.reaction_id);
  if (!rids.length) {
    return { ok: true, center: smiles, nodes: [], edges: [], reactions: 0 };
  }
  const placeholders = rids.map(() => "?").join(",");
  const reactions = db.prepare(
    "SELECT id, ord_id, reaction_smiles FROM ord_reactions WHERE id IN (" +
    placeholders + ")"
  ).all(...rids);
  const participants = db.prepare(
    "SELECT reaction_id, smiles, role FROM ord_participants WHERE reaction_id IN (" +
    placeholders + ") ORDER BY reaction_id"
  ).all(...rids);
  const nodeMap = new Map();
  const edges = [];
  for (const reaction of reactions) {
    nodeMap.set("rxn:" + reaction.id, {
      id: "rxn:" + reaction.id,
      name: reaction.ord_id, formula: "RXN", category: "Reaction",
      reactionId: reaction.id
    });
  }
  let edgeNumber = 0;
  for (const part of participants) {
    if (nodeMap.size >= 380 || edges.length >= 650) break;
    const molId = "mol:" + part.smiles;
    if (!nodeMap.has(molId)) {
      nodeMap.set(molId, {
        id: molId, name: part.smiles,
        formula: part.smiles.length > 26 ? part.smiles.slice(0, 25) + "…" : part.smiles,
        category: "ORD molecule"
      });
    }
    const rxnId = "rxn:" + part.reaction_id;
    const isProduct = part.role === "product";
    edges.push({
      id: "ord-link-" + edgeNumber++,
      source: isProduct ? rxnId : molId,
      target: isProduct ? molId : rxnId,
      reaction: part.role + " participation", cost: 1, role: part.role
    });
  }
  return {
    ok: true, center: smiles, nodes: [...nodeMap.values()], edges,
    reactions: reactions.length, isHypergraphProjection: true
  };
}
export function closeOrdDb() {
  if (opened) opened.close();
  opened = null;
  cachedStats = null;
}
