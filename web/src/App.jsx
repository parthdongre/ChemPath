import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import NetworkGraph from "./components/NetworkGraph.jsx";

const EMPTY_HIGHLIGHT = { nodes: [], edges: [] };
const MIN_SIMULATION_MS = 10_000;
const STEP_REPLAY_MS = 120;
const FINAL_HOLD_MS = 1_000;

function Stat({ value, label }) {
  return (
    <div className="stat">
      <strong>{value ?? "—"}</strong>
      <span>{label}</span>
    </div>
  );
}

function CompoundSelect({ label, value, onChange, compounds, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
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
    <>
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
                <div>
                  <small>{result.reactionPath[index]?.reaction}</small>
                  <em>graph weight {result.reactionPath[index]?.cost ?? 1}</em>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="reaction-audit-list">
        {result.reactionPath.map((reaction, index) => (
          <article className="reaction-audit-card" key={reaction.reactionId}>
            <div className="reaction-audit-index">
              {String(index + 1).padStart(2, "0")}
            </div>
            <div className="reaction-audit-body">
              <div className="reaction-audit-title">
                <strong>{reaction.reaction}</strong>
                <span>{reaction.reversible ? "REVERSIBLE" : "DIRECTED"}</span>
              </div>
              <code>{reaction.equation || "Equation metadata unavailable"}</code>
              <p>{reaction.conditions}</p>
              <div className="reaction-audit-meta">
                <span>{reaction.sourceKey}</span>
                <span>graph weight {reaction.cost}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
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

function AlgorithmSelect({ value, onChange, disabled }) {
  return (
    <label className="field algorithm-select">
      <span>Path algorithm</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="bfs">BFS · minimum reaction steps</option>
        <option value="dijkstra">Dijkstra · binary heap weighted path</option>
        <option value="astar">A* · admissible reverse-hop heuristic</option>
        <option value="dial">Dial · integer-weight bucket queue</option>
        <option value="bellmanford">Bellman-Ford · repeated relaxation</option>
        <option value="bidirectional">Bidirectional BFS · two-front search</option>
        <option value="bidijkstra">Bidirectional Dijkstra · weighted two-front search</option>
        <option value="duan2025">2025 Pivot Frontier · research-inspired hybrid</option>
      </select>
    </label>
  );
}

function StructureSelect({ value, onChange, disabled }) {
  return (
    <label className="field algorithm-select">
      <span>Structure algorithm</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="scc">Tarjan SCC · strongly connected regions</option>
        <option value="cycle">DFS cycle detection · first directed cycle</option>
      </select>
    </label>
  );
}

function SimulationHud({ simulation, currentCompound, onSkip }) {
  if (!simulation.running) return null;

  const progress = simulation.total > 0
    ? Math.min(100, Math.round((simulation.step / simulation.total) * 100))
    : 0;

  return (
    <div className="simulation-hud">
      <div className="simulation-hud-top">
        <div>
          <span className="simulation-kicker">ADAPTIVE ALGORITHM REPLAY</span>
          <strong>{simulation.algorithm}</strong>
        </div>
        <button onClick={onSkip}>Skip replay</button>
      </div>

      <div className="simulation-progress">
        <i style={{ width: `${progress}%` }} />
      </div>

      <div className="simulation-meta">
        <span>
          STEP <b>{simulation.step}</b> / {simulation.total}
        </span>
        <span>
          CURRENT{" "}
          <b>{currentCompound ? currentCompound.formula : "—"}</b>
        </span>
        <span>
          VISITED <b>{simulation.visited.length}</b>
        </span>
        <span>
          ELAPSED <b>{simulation.elapsed.toFixed(1)}s</b>
        </span>
        <span>
          TARGET <b>{((simulation.duration ?? MIN_SIMULATION_MS) / 1000).toFixed(1)}s</b>
        </span>
      </div>

      {currentCompound && (
        <div className="current-compound-card">
          <span>{currentCompound.category}</span>
          <strong>{currentCompound.formula}</strong>
          <p>{currentCompound.name}</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [network, setNetwork] = useState(null);
  const [stats, setStats] = useState(null);
  const [from, setFrom] = useState("Methane");
  const [to, setTo] = useState("Bicarbonate");
  const [mode, setMode] = useState("path");
  const [pathAlgorithm, setPathAlgorithm] = useState("bfs");
  const [structureAlgorithm, setStructureAlgorithm] = useState("scc");
  const [result, setResult] = useState(null);
  const [highlight, setHighlight] = useState(EMPTY_HIGHLIGHT);
  const [status, setStatus] = useState("Connecting to C++");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [reachableTargets, setReachableTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [simulation, setSimulation] = useState({
    running: false,
    algorithm: "",
    step: 0,
    total: 0,
    visited: [],
    active: null,
    elapsed: 0,
    duration: MIN_SIMULATION_MS
  });

  const runTokenRef = useRef(0);

  useEffect(() => {
    Promise.all([api.network(), api.stats()])
      .then(([networkData, statsData]) => {
        setNetwork(networkData);
        setStats(statsData);
        setStatus("C++ engine online");

        if (networkData.nodes?.length > 0) {
          const hasMethane = networkData.nodes.some((node) => node.name === "Methane");
          const hasBicarbonate = networkData.nodes.some((node) => node.name === "Bicarbonate");
          if (!hasMethane) setFrom(networkData.nodes[0].name);
          if (!hasBicarbonate) setTo(networkData.nodes[Math.min(1, networkData.nodes.length - 1)].name);
        }
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
    }, 120);

    return () => window.clearTimeout(timer);
  }, [search]);

  const compounds = network?.nodes ?? [];

  useEffect(() => {
    if (!network || !from) {
      setReachableTargets([]);
      return undefined;
    }

    let cancelled = false;
    setTargetsLoading(true);

    api.reachable(from)
      .then((data) => {
        if (cancelled) return;

        const targets = (data.reachable ?? []).filter(
          (compound) => compound.name !== from
        );

        setReachableTargets(targets);
        setTo((current) => {
          if (targets.some((compound) => compound.name === current)) {
            return current;
          }

          return (
            targets.find((compound) => compound.name === "Bicarbonate")?.name ??
            targets[0]?.name ??
            ""
          );
        });
      })
      .catch(() => {
        if (!cancelled) setReachableTargets([]);
      })
      .finally(() => {
        if (!cancelled) setTargetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, network]);

  const selectedFromId = useMemo(
    () => compounds.find((compound) => compound.name === from)?.id ?? null,
    [compounds, from]
  );

  const currentCompound = useMemo(
    () => compounds.find((compound) => compound.id === simulation.active) ?? null,
    [compounds, simulation.active]
  );

  const algorithmDescription = useMemo(() => {
    if (mode === "dfs") {
      return "DFS · explicit stack · full reachability traversal";
    }

    if (mode === "structure") {
      return structureAlgorithm === "scc"
        ? "Tarjan SCC · low-link values + stack"
        : "Directed cycle detection · DFS recursion state";
    }

    const descriptions = {
      bfs: "BFS · queue · minimum number of reaction edges",
      dijkstra: "Dijkstra · binary heap · minimum total graph weight",
      astar: "A* · priority queue + admissible reverse-hop heuristic",
      dial: "Dial · bucket queue · optimized for small integer weights",
      bellmanford: "Bellman-Ford · repeated edge relaxation · O(VE) baseline",
      bidirectional: "Bidirectional BFS · unweighted search from both ends",
      bidijkstra: "Bidirectional Dijkstra · weighted search from both ends",
      duan2025: "Research mode · pivot/frontier hybrid inspired by Duan et al. STOC 2025"
    };

    return descriptions[pathAlgorithm] ?? descriptions.bfs;
  }, [mode, pathAlgorithm, structureAlgorithm]);

  function cancelReplay() {
    runTokenRef.current += 1;
    setSimulation((previous) => ({
      ...previous,
      running: false,
      active: null,
      elapsed: previous.elapsed
    }));
    setBusy(false);
  }

  async function replay(order, algorithm, finalHighlight) {
    const ids = (order ?? []).map((item) => item.id);
    const token = ++runTokenRef.current;

    const traversalDuration = Math.max(
      MIN_SIMULATION_MS - FINAL_HOLD_MS,
      ids.length * STEP_REPLAY_MS
    );
    const totalDuration = traversalDuration + FINAL_HOLD_MS;

    setHighlight(EMPTY_HIGHLIGHT);
    setSimulation({
      running: true,
      algorithm,
      step: 0,
      total: ids.length,
      visited: [],
      active: null,
      elapsed: 0,
      duration: totalDuration
    });

    if (ids.length === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, totalDuration));
      if (token !== runTokenRef.current) return false;
      setHighlight(finalHighlight);
      setSimulation((previous) => ({
        ...previous,
        running: false,
        elapsed: totalDuration / 1000
      }));
      return true;
    }

    const startedAt = performance.now();
    const stepDuration = traversalDuration / ids.length;

    for (let index = 0; index < ids.length; index += 1) {
      const targetTime = startedAt + (index + 1) * stepDuration;
      const wait = Math.max(0, targetTime - performance.now());

      await new Promise((resolve) => window.setTimeout(resolve, wait));

      if (token !== runTokenRef.current) return false;

      const elapsed = (performance.now() - startedAt) / 1000;
      setSimulation({
        running: true,
        algorithm,
        step: index + 1,
        total: ids.length,
        visited: ids.slice(0, index + 1),
        active: ids[index],
        elapsed,
        duration: totalDuration
      });
    }

    const finalDelay = Math.max(
      0,
      totalDuration - (performance.now() - startedAt)
    );

    await new Promise((resolve) => window.setTimeout(resolve, finalDelay));

    if (token !== runTokenRef.current) return false;

    setHighlight(finalHighlight);
    setSimulation({
      running: false,
      algorithm,
      step: ids.length,
      total: ids.length,
      visited: ids,
      active: null,
      elapsed: totalDuration / 1000,
      duration: totalDuration
    });

    return true;
  }

  function buildPathHighlight(data) {
    const nodeIds = data.path?.map((compound) => compound.id) ?? [];
    const edgeIds =
      data.reactionPath?.map((reaction, index) => {
        const source = data.path[index]?.id;
        const target = data.path[index + 1]?.id;
        return `${source}-${target}-${reaction.reactionId}`;
      }) ?? [];

    return { nodes: nodeIds, edges: edgeIds };
  }

  async function runPath() {
    cancelReplay();
    setBusy(true);
    setMode("path");
    setResult(null);

    try {
      const data = await api.path(from, to, pathAlgorithm);
      setResult(data);

      await replay(
        data.visitedOrder,
        data.algorithm,
        buildPathHighlight(data)
      );
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      if (!simulation.running) setBusy(false);
    }
  }

  async function runDfs() {
    cancelReplay();
    setBusy(true);
    setMode("dfs");
    setResult(null);

    try {
      const data = await api.reachable(from);
      setResult(data);

      await replay(
        data.visitedOrder,
        "DFS",
        {
          nodes: data.reachable?.map((compound) => compound.id) ?? [],
          edges: []
        }
      );
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      setBusy(false);
    }
  }

  async function runStructure() {
    cancelReplay();
    setBusy(true);
    setMode("structure");
    setResult(null);

    try {
      if (structureAlgorithm === "scc") {
        const data = await api.scc();
        setResult(data);

        await replay(
          data.visitedOrder,
          "Tarjan SCC",
          {
            nodes: data.components?.[0]?.map((compound) => compound.id) ?? [],
            edges: []
          }
        );
      } else {
        const data = await api.cycles();
        setResult(data);

        await replay(
          data.visitedOrder,
          "Directed cycle detection",
          {
            nodes: data.cycle?.map((compound) => compound.id) ?? [],
            edges: []
          }
        );
      }
    } catch (error) {
      setResult({ error: error.message });
      setHighlight(EMPTY_HIGHLIGHT);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    cancelReplay();
    setResult(null);
    setHighlight(EMPTY_HIGHLIGHT);
    setSimulation({
      running: false,
      algorithm: "",
      step: 0,
      total: 0,
      visited: [],
      active: null,
      elapsed: 0,
      duration: MIN_SIMULATION_MS
    });
  }

  function setModeClean(nextMode) {
    reset();
    setMode(nextMode);
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
            Watch C++ graph algorithms move through a curated, chemistry-audited
            reaction network, one visited compound at a time.
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
              disabled={simulation.running}
            >
              Pathfinding
            </button>
            <button
              className={mode === "dfs" ? "active" : ""}
              onClick={() => setModeClean("dfs")}
              disabled={simulation.running}
            >
              DFS / Explore
            </button>
            <button
              className={mode === "structure" ? "active" : ""}
              onClick={() => setModeClean("structure")}
              disabled={simulation.running}
            >
              Structure
            </button>
          </div>

          <div className="algorithm-readout">
            <span>{algorithmDescription}</span>
            <em>
              {simulation.running
                ? `target ${((simulation.duration ?? MIN_SIMULATION_MS) / 1000).toFixed(1)}s`
                : "adaptive ≥10s replay"}
            </em>
          </div>

          <button className="reset-button" onClick={reset}>
            Clear
          </button>
        </header>

        <div className="command-bar">
          <div className="command-primary">
            {mode === "path" && (
              <>
                <AlgorithmSelect
                  value={pathAlgorithm}
                  onChange={setPathAlgorithm}
                  disabled={busy}
                />
                <CompoundSelect
                  label="Start"
                  value={from}
                  onChange={setFrom}
                  compounds={compounds}
                  disabled={busy}
                />
                <span className="command-arrow">→</span>
                <CompoundSelect
                  label={targetsLoading ? "Reachable target · checking" : `Reachable target · ${reachableTargets.length}`}
                  value={to}
                  onChange={setTo}
                  compounds={reachableTargets}
                  disabled={busy || targetsLoading || reachableTargets.length === 0}
                />
                <button
                  className="run-button"
                  disabled={
                    busy ||
                    !network ||
                    targetsLoading ||
                    reachableTargets.length === 0 ||
                    !to
                  }
                  onClick={runPath}
                >
                  {simulation.running ? "Replaying…" : "Run algorithm"}
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
                  disabled={busy}
                />
                <div className="algorithm-summary">
                  <span>STACK</span>
                  <strong>Depth-first reachability</strong>
                </div>
                <button
                  className="run-button"
                  disabled={busy || !network}
                  onClick={runDfs}
                >
                  {simulation.running ? "Replaying…" : "Run DFS"}
                </button>
              </>
            )}

            {mode === "structure" && (
              <>
                <StructureSelect
                  value={structureAlgorithm}
                  onChange={setStructureAlgorithm}
                  disabled={busy}
                />
                <div className="algorithm-summary">
                  <span>GRAPH STRUCTURE</span>
                  <strong>
                    {structureAlgorithm === "scc"
                      ? "Find mutually reachable regions"
                      : "Find a directed cycle"}
                  </strong>
                </div>
                <button
                  className="run-button"
                  disabled={busy || !network}
                  onClick={runStructure}
                >
                  {simulation.running ? "Replaying…" : "Analyze graph"}
                </button>
              </>
            )}
          </div>

          <div className="compound-search">
            <label>
              <span>Trie search</span>
              <input
                value={search}
                disabled={simulation.running}
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
            <span>LIVE NETWORK · {stats?.directedEdges ?? "—"} EDGES</span>
            <p>drag · scroll to zoom · replay follows the active compound</p>
          </div>

          <SimulationHud
            simulation={simulation}
            currentCompound={currentCompound}
            onSkip={cancelReplay}
          />

          {network ? (
            <NetworkGraph
              network={network}
              highlightedNodeIds={highlight.nodes}
              highlightedEdgeIds={highlight.edges}
              selectedNodeId={selectedFromId}
              visitedNodeIds={simulation.visited}
              activeNodeId={simulation.active}
              simulationRunning={simulation.running}
            />
          ) : (
            <div className="graph-loading">Waiting for C++ engine</div>
          )}

          <div className="graph-legend">
            <span><i className="organic" /> Organic</span>
            <span><i className="acid" /> Acid</span>
            <span><i className="ion" /> Ion</span>
            <span><i className="bio" /> Biochemical</span>
            <span><i className="salt" /> Salt</span>
            <span><i className="inorganic" /> Inorganic</span>
          </div>
        </div>

        <section className="result-dock">
          <div className="result-label">
            <span>OUTPUT</span>
            <strong>
              {mode === "path" && "Reaction pathway"}
              {mode === "dfs" && "Reachability"}
              {mode === "structure" &&
                (structureAlgorithm === "scc" ? "Strong components" : "Cycle analysis")}
            </strong>
          </div>

          {!result && (
            <div className="result-empty">
              Select an algorithm and run it. Replay lasts at least 10 seconds and expands automatically for larger traversals.
            </div>
          )}

          {result?.error && <div className="result-error">{result.error}</div>}

          {simulation.running && (
            <div className="result-live">
              <span>SIMULATION IN PROGRESS</span>
              <strong>
                {simulation.algorithm} · step {simulation.step}/{simulation.total}
              </strong>
              <p>
                The computation already finished in C++; this deliberately slowed replay
                visualizes each node expansion.
              </p>
            </div>
          )}

          {mode === "path" && result && !result.error && !simulation.running && (
            <>
              <div className="run-meta">
                <span><b>{result.algorithm}</b> algorithm</span>
                <span><b>{result.steps ?? 0}</b> reaction steps</span>
                <span><b>{result.totalCost ?? 0}</b> graph weight</span>
                <span><b>{result.visitedCount ?? 0}</b> visited</span>
                <span><b>{result.elapsedMs ?? "—"}</b> ms C++ runtime</span>
              </div>

              {result.found ? (
                <PathResult result={result} />
              ) : (
                <div className="result-empty">No directed pathway found.</div>
              )}
            </>
          )}

          {mode === "dfs" && result?.reachable && !simulation.running && (
            <>
              <div className="run-meta">
                <span><b>{result.count ?? 0}</b> reachable compounds</span>
                <span><b>{result.elapsedMs ?? "—"}</b> ms C++ runtime</span>
              </div>

              <div className="compound-strip">
                {result.reachable.slice(0, 80).map((compound, index) => (
                  <div key={compound.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{compound.formula}</strong>
                    <small>{compound.name}</small>
                  </div>
                ))}
              </div>
            </>
          )}

          {mode === "structure" &&
            structureAlgorithm === "cycle" &&
            result?.cycle &&
            !simulation.running && (
              <>
                <div className="run-meta">
                  <span><b>{result.hasCycle ? "YES" : "NO"}</b> directed cycle</span>
                </div>

                <div className="cycle-path">
                  {result.cycle.length > 0
                    ? result.cycle.map((compound, index) => (
                        <span key={`${compound.id}-${index}`}>
                          <b>{compound.formula}</b>
                          <small>{compound.name}</small>
                          {index < result.cycle.length - 1 && <em>→</em>}
                        </span>
                      ))
                    : "No directed cycle found."}
                </div>
              </>
            )}

          {mode === "structure" &&
            structureAlgorithm === "scc" &&
            result?.components &&
            !simulation.running && (
              <>
                <div className="run-meta">
                  <span><b>{result.componentCount}</b> strongly connected components</span>
                  <span><b>{result.largestComponentSize}</b> nodes in largest SCC</span>
                  <span><b>{result.elapsedMs ?? "—"}</b> ms C++ runtime</span>
                </div>

                <div className="scc-preview">
                  {(result.components[0] ?? []).slice(0, 50).map((compound) => (
                    <div key={compound.id}>
                      <strong>{compound.formula}</strong>
                      <span>{compound.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
        </section>
      </section>

      <div className="rule" id="engine">
        <span>02</span>
        <p>Algorithm stack</p>
      </div>

      <section className="engine-map">
        <div className="engine-copy">
          <p className="eyebrow">C++17 DATA STRUCTURES ENGINE</p>
          <h2>Twelve algorithms. One reaction graph.</h2>
          <p>
            The browser only renders the result and replay. Queue, stack, priority
            queue, buckets, heaps, parent reconstruction, hashing, Trie search,
            cycle state and low-link logic all execute in C++. The 2025 research
            mode is explicitly an educational pivot-frontier hybrid, not a claim
            to reproduce the full STOC asymptotic construction.
          </p>
        </div>

        <div className="structure-table">
          <div><span>01</span><strong>BFS</strong><small>queue · shortest edge count</small></div>
          <div><span>02</span><strong>Dijkstra</strong><small>binary heap · weighted SSSP</small></div>
          <div><span>03</span><strong>A*</strong><small>admissible heuristic · guided search</small></div>
          <div><span>04</span><strong>Dial</strong><small>bucket queue · small integer weights</small></div>
          <div><span>05</span><strong>Bellman-Ford</strong><small>repeated relaxation · baseline SSSP</small></div>
          <div><span>06</span><strong>Bidirectional BFS</strong><small>two unweighted frontiers</small></div>
          <div><span>07</span><strong>Bidirectional Dijkstra</strong><small>two weighted frontiers</small></div>
          <div><span>08</span><strong>2025 Pivot Frontier</strong><small>research-inspired Bellman-Ford + frontier hybrid</small></div>
          <div><span>09</span><strong>DFS</strong><small>stack · reachability</small></div>
          <div><span>10</span><strong>Tarjan SCC</strong><small>low-link + stack</small></div>
          <div><span>11</span><strong>Cycle detection</strong><small>DFS state tracking</small></div>
          <div><span>12</span><strong>Trie search</strong><small>prefix lookup</small></div>
        </div>
      </section>

      <footer>
        <span>ChemPath / dense simulation build</span>
        <span>C++17 · React · Cytoscape.js</span>
        <span>Educational reaction-network model · not a synthesis planner</span>
      </footer>
    </main>
  );
}
