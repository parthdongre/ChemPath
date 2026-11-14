const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8787/api");

// Builds "/path?a=1&b=2", URL-encoding every value and skipping null/undefined.
export function buildPath(path, params) {
  if (!params) return path;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

// Every API method accepts an optional last argument { signal } so callers
// can cancel stale requests (e.g. while the user is still typing).
async function request(path, { params, signal, ...options } = {}) {
  const response = await fetch(`${API_BASE}${buildPath(path, params)}`, { ...options, signal });
  const payload = await response.json().catch(() => ({
    ok: false,
    error: "Invalid API response"
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

const get = (path, params, opts) => request(path, { params, ...opts });

export const isAbortError = error => error?.name === "AbortError";

export const api = {
  network: opts => get("/network", null, opts),
  neighborhood: (center, depth = 2, limit = 350, opts) =>
    get("/graph/neighborhood", { center, depth, limit }, opts),
  stats: opts => get("/stats", null, opts),
  constrained: (params, opts) =>
    request("/path/constrained", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      ...opts
    }),
  pareto: (from, to, objective = "steps-cost", maxLabels = 50000, maxRoutes = 10, opts) =>
    get("/path/pareto", { from, to, objective, maxLabels, maxRoutes }, opts),
  feasible: (available, target, opts) => get("/feasible", { available, target }, opts),
  path: (from, to, algorithm = "bfs", opts) => get("/path", { from, to, algorithm }, opts),
  reachable: (from, opts) => get("/reachable", { from }, opts),
  cycles: opts => get("/cycles", null, opts),
  scc: opts => get("/scc", null, opts),
  search: (q, opts) => get("/search", { q }, opts),
  labTrace: (algorithm, from, to, opts) => get("/lab/trace", { algorithm, from, to }, opts),
  labCompare: (from, to, opts) => get("/lab/compare", { from, to }, opts),
  labComponents: opts => get("/lab/components", null, opts),
  labPaths: (from, to, k = 3, opts) => get("/lab/kpaths", { from, to, k }, opts),
  labPlayground: (from, to, edgeFrom, edgeTo, reactionId, opts) =>
    get("/lab/playground", { from, to, edgeFrom, edgeTo, reactionId }, opts),
  labEdit: (from, to, mode, edgeFrom, edgeTo, reactionId, weight, opts) =>
    get("/lab/edit", { from, to, mode, edgeFrom, edgeTo, reactionId, weight }, opts),
  labCsr: opts => get("/lab/csr", null, opts),
  labSynthetic: (nodes, edges, seed, opts) => get("/lab/synthetic", { nodes, edges, seed }, opts),
  catalogStatus: opts => get("/catalog/status", null, opts),
  catalogSearch: (q = "", limit = 24, after = null, opts) =>
    get("/catalog/search", { q, limit, after }, opts),
  catalogCompound: (cid, opts) => get("/catalog/compound/" + encodeURIComponent(cid), null, opts),
  ordStatus: opts => get("/ord/status", null, opts),
  ordPath: (from, to, maxExpanded = 2500, opts) =>
    get("/ord/path", { from, to, maxExpanded }, opts),
  ordSearch: (q, limit = 24, opts) => get("/ord/search", { q, limit }, opts),
  ordReaction: (id, opts) => get("/ord/reaction/" + encodeURIComponent(id), null, opts),
  ordNeighborhood: (smiles, limit = 26, opts) => get("/ord/neighborhood", { smiles, limit }, opts)
};
