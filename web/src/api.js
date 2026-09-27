const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";

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
  stats: () => request("/stats"),
  path: (from, to, algorithm = "bfs") =>
    request(
      `/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&algorithm=${encodeURIComponent(algorithm)}`
    ),
  reachable: (from) =>
    request(`/reachable?from=${encodeURIComponent(from)}`),
  cycles: () => request("/cycles"),
  scc: () => request("/scc"),
  search: (query) => request(`/search?q=${encodeURIComponent(query)}`)
};
