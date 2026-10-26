const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8787/api");

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const payload = await response.json().catch(() => ({
    ok: false,
    error: "Invalid API response"
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

export const api = {
  network: () => request("/network"),
  neighborhood: (center, depth=2, limit=350) => request(`/graph/neighborhood?center=${encodeURIComponent(center)}&depth=${depth}&limit=${limit}`),
  stats: () => request("/stats"),
  path: (from, to, algorithm = "bfs") =>
    request(
      `/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&algorithm=${encodeURIComponent(algorithm)}`
    ),
  reachable: (from) =>
    request(`/reachable?from=${encodeURIComponent(from)}`),
  cycles: () => request("/cycles"),
  scc: () => request("/scc"),
  search: (query) => request(`/search?q=${encodeURIComponent(query)}`),
  labTrace: (algorithm, from, to) => request(`/lab/trace?algorithm=${encodeURIComponent(algorithm)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  labCompare: (from,to) => request(`/lab/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  labComponents: () => request("/lab/components"),
  labPaths: (from,to,k=3) => request(`/lab/kpaths?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&k=${k}`),
  labPlayground: (from,to,edgeFrom,edgeTo,reactionId) =>
    request(`/lab/playground?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&edgeFrom=${edgeFrom}&edgeTo=${edgeTo}&reactionId=${reactionId}`),
  labEdit: (from,to,mode,edgeFrom,edgeTo,reactionId,weight) =>
    request(`/lab/edit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}&edgeFrom=${edgeFrom}&edgeTo=${edgeTo}&reactionId=${reactionId}&weight=${weight}`),
  labCsr: () => request("/lab/csr"),
  labSynthetic: (nodes,edges,seed) => request(`/lab/synthetic?nodes=${nodes}&edges=${edges}&seed=${seed}`)
};
