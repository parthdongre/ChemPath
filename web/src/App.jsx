import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import NetworkGraph from "./components/NetworkGraph.jsx";

const EMPTY_HIGHLIGHT = { nodes: [], edges: [] };

function Stat({ value, label }) {
  return (
    <div className="stat">
      <strong>{value ?? "—"}</strong>
      <span>{label}</span>
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
            {compound.formula} · {compound.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PathResult({ result }) {
  if (!result?.found) return null;

  return (
    <div className="path-line">
      {result.path.map((compound, index) => (
        <div className="path-node-wrap" key={compound.id}>
          <div className="path-node">
            <strong>{compound.formula}</strong>
            <span>{compound.name}</span>
          </div>
          {index < result.path.length - 1 && (
            <div className="reaction-edge">
              <span>→</span>
              <small>{result.reactionPath[index]?.reaction}</small>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Status({ status }) {
  const online = status.includes("online");
  return (
    <div className={`status-chip ${online ? "online" : ""}`}>
      <span className="status-dot" />
      <span>{status}</span>
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
  const [status, setStatus] = useState("Connecting to C++");
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
      const edgeIds =
        data.reactionPath?.map((reaction, index) => {
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

  function reset() {
    setResult(null);
    setHighlight(EMPTY_HIGHLIGHT);
  }

  function setModeClean(nextMode) {
    setMode(nextMode);
    reset();
  }

  return (
    <main className="site-shell">
      <header className="nav">
        <a className="wordmark" href="#top" aria-label="ChemPath home">
          <span className="mark">CP</span>
          <span>ChemPath</span>
        </a>

        <nav className="nav-links" aria-label="Primary">
          <a href="#explorer">Explorer</a>
          <a href="#engine">Engine</a>
        </nav>

        <Status status={status} />
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">GRAPH-BASED CHEMICAL PATHWAYS</p>
          <h1>Trace the reaction.</h1>
          <p className="lede">
            Explore known transformations with graph algorithms implemented in C++.
          </p>
        </div>

        <div className="hero-stats" aria-label="Dataset statistics">
          <Stat value={stats?.compounds} label="compounds" />
          <Stat value={stats?.reactions} label="reactions" />
          <Stat value={stats?.directedEdges} label="directed edges" />
        </div>
      </section>

      <div className="rule">
        <span>01</span>
        <p>Reaction explorer</p>
      </div>

      <section className="explorer" id="explorer">
        <header className="explorer-head">
          <div className="mode-switch" role="tablist" aria-label="Algorithm mode">
            <button
              className={mode === "path" ? "active" : ""}
              onClick={() => setModeClean("path")}
            >
              BFS / Path
            </button>
            <button
              className={mode === "dfs" ? "active" : ""}
              onClick={() => setModeClean("dfs")}
            >
              DFS / Explore
            </button>
            <button
              className={mode === "cycle" ? "active" : ""}
              onClick={() => setModeClean("cycle")}
            >
              Cycle scan
            </button>
          </div>

          <button className="reset-button" onClick={reset}>
            Clear result
          </button>
        </header>

        <div className="command-bar">
          <div className="command-primary">
            {mode === "path" && (
              <>
                <CompoundSelect
                  label="Start"
                  value={from}
                  onChange={setFrom}
                  compounds={compounds}
                />
                <span className="command-arrow">→</span>
                <CompoundSelect
                  label="Target"
                  value={to}
                  onChange={setTo}
                  compounds={compounds}
                />
                <button className="run-button" disabled={busy || !network} onClick={runPath}>
                  {busy ? "Running…" : "Find path"}
                </button>
              </>
            )}

            {mode === "dfs" && (
              <>
                <CompoundSelect
                  label="Explore from"
                  value={from}
                  onChange={setFrom}
                  compounds={compounds}
                />
                <button className="run-button" disabled={busy || !network} onClick={runDfs}>
                  {busy ? "Traversing…" : "Run DFS"}
                </button>
              </>
            )}

            {mode === "cycle" && (
              <div className="cycle-command">
                <div>
                  <span className="command-kicker">Directed graph</span>
                  <strong>Find the first cycle</strong>
                </div>
                <button className="run-button" disabled={busy || !network} onClick={runCycle}>
                  {busy ? "Scanning…" : "Scan network"}
                </button>
              </div>
            )}
          </div>

          <div className="compound-search">
            <label>
              <span>Trie search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="meth…"
                aria-label="Search compounds using Trie"
              />
            </label>

            {matches.length > 0 && (
              <div className="search-popover">
                {matches.map((compound) => (
                  <button
                    key={compound.id}
                    onClick={() => {
                      setFrom(compound.name);
                      setSearch(compound.name);
                      setMatches([]);
                    }}
                  >
                    <span>{compound.formula}</span>
                    <small>{compound.name}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="graph-frame">
          <div className="graph-caption">
            <span>LIVE NETWORK</span>
            <p>drag nodes · scroll to zoom · arrows show direction</p>
          </div>

          {network ? (
            <NetworkGraph
              network={network}
              highlightedNodeIds={highlight.nodes}
              highlightedEdgeIds={highlight.edges}
              selectedNodeId={selectedFromId}
            />
          ) : (
            <div className="graph-loading">Waiting for C++ engine</div>
          )}

          <div className="graph-legend">
            <span><i className="organic" /> Organic</span>
            <span><i className="acid" /> Acid</span>
            <span><i className="ion" /> Ion</span>
            <span><i className="bio" /> Biochemical</span>
            <span><i className="inorganic" /> Inorganic</span>
          </div>
        </div>

        <section className="result-dock">
          <div className="result-label">
            <span>OUTPUT</span>
            <strong>
              {mode === "path" && "Shortest pathway"}
              {mode === "dfs" && "Reachable compounds"}
              {mode === "cycle" && "Cycle analysis"}
            </strong>
          </div>

          {!result && (
            <div className="result-empty">
              Run an algorithm to inspect the network.
            </div>
          )}

          {result?.error && <div className="result-error">{result.error}</div>}

          {mode === "path" && result && !result.error && (
            <>
              <div className="run-meta">
                <span><b>{result.steps ?? 0}</b> steps</span>
                <span><b>{result.visitedCount ?? 0}</b> visited</span>
                <span><b>{result.elapsedMs ?? "—"}</b> ms</span>
              </div>

              {result.found ? (
                <PathResult result={result} />
              ) : (
                <div className="result-empty">No directed pathway found.</div>
              )}
            </>
          )}

          {mode === "dfs" && result?.reachable && (
            <>
              <div className="run-meta">
                <span><b>{result.count ?? 0}</b> reachable</span>
                <span><b>{result.elapsedMs ?? "—"}</b> ms</span>
              </div>
              <div className="compound-strip">
                {result.reachable.map((compound, index) => (
                  <div key={compound.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{compound.formula}</strong>
                    <small>{compound.name}</small>
                  </div>
                ))}
              </div>
            </>
          )}

          {mode === "cycle" && result?.cycle && (
            <>
              <div className="run-meta">
                <span><b>{result.hasCycle ? "YES" : "NO"}</b> cycle</span>
              </div>
              <div className="cycle-path">
                {result.cycle.length > 0
                  ? result.cycle.map((compound, index) => (
                      <span key={`${compound.id}-${index}`}>
                        <b>{compound.formula}</b>
                        {index < result.cycle.length - 1 && " → "}
                      </span>
                    ))
                  : "No directed cycle found."}
              </div>
            </>
          )}
        </section>
      </section>

      <div className="rule" id="engine">
        <span>02</span>
        <p>What the C++ engine is doing</p>
      </div>

      <section className="engine-map">
        <div className="engine-copy">
          <p className="eyebrow">DATA STRUCTURES</p>
          <h2>Frontend shows it. C++ decides it.</h2>
          <p>
            The browser renders the graph. Traversal, lookup, path reconstruction and
            cycle detection stay inside the C++17 engine.
          </p>
        </div>

        <div className="structure-table">
          <div><span>01</span><strong>Adjacency list</strong><small>reaction graph</small></div>
          <div><span>02</span><strong>Queue</strong><small>BFS frontier</small></div>
          <div><span>03</span><strong>Stack</strong><small>iterative DFS</small></div>
          <div><span>04</span><strong>Hash table</strong><small>compound → id</small></div>
          <div><span>05</span><strong>Trie</strong><small>prefix search</small></div>
          <div><span>06</span><strong>Parent map</strong><small>path rebuild</small></div>
        </div>
      </section>

      <footer>
        <span>ChemPath / mid-sem build</span>
        <span>C++17 · React · Cytoscape.js</span>
        <span>Educational reaction-network model</span>
      </footer>
    </main>
  );
}
