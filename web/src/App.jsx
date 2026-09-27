import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import NetworkGraph from "./components/NetworkGraph.jsx";

const EMPTY_HIGHLIGHT = { nodes: [], edges: [] };

function Metric({ label, value, hint }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function CompoundSelect({ label, value, onChange, compounds }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {compounds.map((compound) => (
          <option key={compound.id} value={compound.name}>
            {compound.name} · {compound.formula}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultPath({ result }) {
  if (!result) return null;
  if (!result.found) {
    return (
      <div className="empty-result">
        No directed pathway was found between those compounds in the current dataset.
      </div>
    );
  }

  return (
    <div className="path-result">
      <div className="path-strip">
        {result.path.map((compound, index) => (
          <div className="path-step" key={compound.id}>
            <div className="formula-chip">{compound.formula}</div>
            <span>{compound.name}</span>
            {index < result.path.length - 1 && (
              <div className="path-arrow">
                <b>→</b>
                <small>{result.reactionPath[index]?.reaction}</small>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [network, setNetwork] = useState(null);
  const [stats, setStats] = useState(null);
  const [from, setFrom] = useState("Methane");
  const [to, setTo] = useState("Bicarbonate");
  const [mode, setMode] = useState("path");
  const [result, setResult] = useState(null);
  const [highlight, setHighlight] = useState(EMPTY_HIGHLIGHT);
  const [status, setStatus] = useState("Loading C++ engine…");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    Promise.all([api.network(), api.stats()])
      .then(([networkData, statsData]) => {
        setNetwork(networkData);
        setStats(statsData);
        setStatus("C++ engine online");
      })
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const value = search.trim();
    if (value.length < 2) {
      setMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      api.search(value)
        .then((data) => setMatches(data.matches || []))
        .catch(() => setMatches([]));
    }, 140);

    return () => window.clearTimeout(timer);
  }, [search]);

  const compounds = network?.nodes ?? [];
  const selectedFromId = useMemo(
    () => compounds.find((compound) => compound.name === from)?.id ?? null,
    [compounds, from]
  );

  async function runPath() {
    setBusy(true);
    setMode("path");
    try {
      const data = await api.path(from, to);
      setResult(data);
      const nodeIds = data.path?.map((compound) => compound.id) ?? [];
      const edgeIds = data.reactionPath?.map((reaction, index) => {
        const source = data.path[index]?.id;
        const target = data.path[index + 1]?.id;
        return `${source}-${target}-${reaction.reactionId}`;
      }) ?? [];
      setHighlight({ nodes: nodeIds, edges: edgeIds });
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      setBusy(false);
    }
  }

  async function runDfs() {
    setBusy(true);
    setMode("dfs");
    try {
      const data = await api.reachable(from);
      setResult(data);
      setHighlight({
        nodes: data.reachable?.map((compound) => compound.id) ?? [],
        edges: []
      });
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      setBusy(false);
    }
  }

  async function runCycle() {
    setBusy(true);
    setMode("cycle");
    try {
      const data = await api.cycles();
      setResult(data);
      setHighlight({
        nodes: data.cycle?.map((compound) => compound.id) ?? [],
        edges: []
      });
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      setBusy(false);
    }
  }

  function clearHighlight() {
    setResult(null);
    setHighlight(EMPTY_HIGHLIGHT);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <h1>ChemPath</h1>
            <p>Interactive reaction network explorer</p>
          </div>
        </div>
        <div className={`engine-status ${status.includes("online") ? "online" : ""}`}>
          <i />
          {status}
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">DATA STRUCTURES × CHEMISTRY</div>
          <h2>Explore chemistry as a graph.</h2>
          <p>
            A scientific network interface backed by a C++17 engine implementing
            graph traversal, hashing, cycle detection and Trie prefix search.
          </p>
        </div>
        <div className="hero-metrics">
          <Metric label="Compounds" value={stats?.compounds} hint="graph vertices" />
          <Metric label="Reactions" value={stats?.reactions} hint="known transformations" />
          <Metric label="Edges" value={stats?.directedEdges} hint="adjacency-list links" />
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <div className="panel-heading">
            <span>Analysis console</span>
            <button className="text-button" onClick={clearHighlight}>Reset</button>
          </div>

          <div className="mode-tabs">
            <button className={mode === "path" ? "active" : ""} onClick={() => setMode("path")}>Path</button>
            <button className={mode === "dfs" ? "active" : ""} onClick={() => setMode("dfs")}>Explore</button>
            <button className={mode === "cycle" ? "active" : ""} onClick={() => setMode("cycle")}>Cycles</button>
          </div>

          {mode === "path" && (
            <div className="control-section">
              <CompoundSelect label="Start compound" value={from} onChange={setFrom} compounds={compounds} />
              <CompoundSelect label="Target compound" value={to} onChange={setTo} compounds={compounds} />
              <button className="primary-button" disabled={busy || !network} onClick={runPath}>
                {busy ? "Running BFS…" : "Find shortest pathway"}
              </button>
              <p className="algorithm-note">
                <strong>BFS</strong> uses a queue, visited set and parent map to return
                the minimum number of reaction edges.
              </p>
            </div>
          )}

          {mode === "dfs" && (
            <div className="control-section">
              <CompoundSelect label="Explore from" value={from} onChange={setFrom} compounds={compounds} />
              <button className="primary-button" disabled={busy || !network} onClick={runDfs}>
                {busy ? "Running DFS…" : "Explore reachable compounds"}
              </button>
              <p className="algorithm-note">
                <strong>DFS</strong> uses an explicit stack to traverse the complete
                reachable subnetwork from the selected compound.
              </p>
            </div>
          )}

          {mode === "cycle" && (
            <div className="control-section">
              <button className="primary-button" disabled={busy || !network} onClick={runCycle}>
                {busy ? "Scanning graph…" : "Detect a directed cycle"}
              </button>
              <p className="algorithm-note">
                A three-state DFS identifies back edges and reconstructs one cycle
                from the recursion parent chain.
              </p>
            </div>
          )}

          <div className="divider" />

          <div className="search-block">
            <label className="field">
              <span>Trie compound finder</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Try: meth"
              />
            </label>

            <div className="search-results">
              {matches.map((compound) => (
                <button
                  key={compound.id}
                  onClick={() => {
                    setFrom(compound.name);
                    setSearch(compound.name);
                    setMatches([]);
                  }}
                >
                  <b>{compound.formula}</b>
                  <span>{compound.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="structure-list">
            <span>Engine structures</span>
            <div>
              {(stats?.structures ?? []).map((structure) => (
                <em key={structure}>{structure}</em>
              ))}
            </div>
          </div>
        </aside>

        <div className="graph-panel">
          <div className="graph-toolbar">
            <div>
              <span className="live-dot" />
              Reaction network
            </div>
            <p>Drag nodes · scroll to zoom · arrows show direction</p>
          </div>

          {network ? (
            <NetworkGraph
              network={network}
              highlightedNodeIds={highlight.nodes}
              highlightedEdgeIds={highlight.edges}
              selectedNodeId={selectedFromId}
            />
          ) : (
            <div className="graph-loading">Connecting to ChemPath C++ engine…</div>
          )}

          <div className="legend">
            <span><i className="organic" /> Organic</span>
            <span><i className="acid" /> Acid</span>
            <span><i className="ion" /> Ion</span>
            <span><i className="biochemical" /> Biochemical</span>
            <span><i className="inorganic" /> Inorganic</span>
          </div>
        </div>
      </section>

      <section className="result-panel">
        <div className="result-heading">
          <div>
            <span className="eyebrow">ALGORITHM OUTPUT</span>
            <h3>
              {mode === "path" && "Shortest reaction pathway"}
              {mode === "dfs" && "Reachable reaction subnetwork"}
              {mode === "cycle" && "Cycle analysis"}
            </h3>
          </div>

          {result && !result.error && (
            <div className="result-metrics">
              {mode === "path" && <>
                <Metric label="Steps" value={result.steps} />
                <Metric label="Visited" value={result.visitedCount} />
                <Metric label="Runtime" value={`${result.elapsedMs} ms`} />
              </>}
              {mode === "dfs" && <>
                <Metric label="Reachable" value={result.count} />
                <Metric label="Runtime" value={`${result.elapsedMs} ms`} />
              </>}
              {mode === "cycle" && <Metric label="Cycle found" value={result.hasCycle ? "Yes" : "No"} />}
            </div>
          )}
        </div>

        {!result && (
          <div className="empty-result">
            Run an analysis from the left panel. Results returned by the C++ engine will appear here.
          </div>
        )}

        {result?.error && <div className="error-result">{result.error}</div>}

        {mode === "path" && result && !result.error && <ResultPath result={result} />}

        {mode === "dfs" && result?.reachable && (
          <div className="compound-grid">
            {result.reachable.map((compound, index) => (
              <div key={compound.id}>
                <b>{index + 1}</b>
                <span>{compound.formula}</span>
                <small>{compound.name}</small>
              </div>
            ))}
          </div>
        )}

        {mode === "cycle" && result?.cycle && (
          <div className="cycle-result">
            {result.cycle.map((compound, index) => (
              <span key={`${compound.id}-${index}`}>
                <b>{compound.formula}</b>
                {index < result.cycle.length - 1 && " → "}
              </span>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>ChemPath mid-sem build</span>
        <span>C++17 engine · React interface · Cytoscape.js visualization</span>
        <span>Educational network model — not a synthesis-planning tool</span>
      </footer>
    </main>
  );
}
