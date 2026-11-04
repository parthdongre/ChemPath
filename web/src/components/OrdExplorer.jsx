import { useEffect, useState } from "react";
import { Database, Search, Network, FlaskConical, ExternalLink, RefreshCw } from "lucide-react";
import SigmaNetwork from "./SigmaNetwork.jsx";
import { api } from "../api.js";
import "./OrdExplorer.css";

const fmt = n => typeof n === "number" ? n.toLocaleString() : "—";
const setupCommands = [
  "python3 -m venv .venv",
  "source .venv/bin/activate",
  "pip install -r scripts/requirements-ord.txt",
  "python3 scripts/import-ord.py --limit 20000"
].join("\n");

export default function OrdExplorer() {
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("CCO");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [busy, setBusy] = useState("");
  const [pathFrom, setPathFrom] = useState("CCO");
  const [pathTo, setPathTo] = useState("CC=O");
  const [pathResult, setPathResult] = useState(null);
  const [error, setError] = useState("");
  const refresh = () => api.ordStatus().then(setStatus).catch(err => setError(err.message));

  useEffect(() => { refresh(); }, []);

  async function action(kind, fn) {
    setError(""); setBusy(kind);
    try { await fn(); }
    catch (err) { setError(err.message || "ORD query failed"); }
    finally { setBusy(""); }
  }
  function search() {
    if (query.trim().length < 2) return;
    action("search", async () => {
      const data = await api.ordSearch(query.trim(), 24);
      setResults(data.matches);
      setSelected(null);
      setNeighborhood(null);
    });
  }
  function chooseReaction(id) {
    action("detail", async () => {
      const data = await api.ordReaction(id);
      setSelected(data);
      setNeighborhood(null);
    });
  }
  function showNeighborhood(smiles) {
    action("network", async () => {
      const data = await api.ordNeighborhood(smiles, 26);
      setNeighborhood(data);
    });
  }

  return <section id="ord-database" className="ord-panel" aria-label="Open Reaction Database explorer">
    <div className="ord-header">
      <div>
        <p className="ord-eyebrow"><Database size={14}/> LARGE DATASET / SQLITE</p>
        <h2>Open Reaction Database</h2>
        <p>Explore millions of source reaction records without loading the entire network into your browser.</p>
      </div>
      <div className="ord-status">
        <span className={status?.available ? "ord-dot connected" : "ord-dot"}/>
        {status?.available ? "Indexed locally" : "Optional local dataset"}
      </div>
    </div>

    {status?.available ? <>
      <div className="ord-metrics">
        <div><small>Indexed reaction records</small><strong>{fmt(status.reactions)}</strong></div>
        <div><small>With reaction SMILES</small><strong>{fmt(status.withReactionSmiles)}</strong></div>
        <div><small>Parquet files processed</small><strong>{fmt(status.importedFiles)}</strong></div>
        <div><small>Data license</small><strong>CC BY-SA 4.0</strong></div>
      </div>
      <div className="ord-search">
        <label htmlFor="ord-query">Search molecular SMILES or an ORD reaction ID</label>
        <div className="ord-query-row">
          <Search size={17}/>
          <input id="ord-query" type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") search(); }}
            placeholder="e.g. CCO or ord-…" maxLength={180}/>
          <button disabled={!!busy || query.trim().length < 2} onClick={search}>
            {busy === "search" ? "Searching…" : "Search database"}
          </button>
        </div>
        <small>SMILES prefixes are structure strings, not common chemical names. Try CCO, CC(=O), or an ORD identifier.</small>
      </div>

      <div className="ord-search">
        <div className="ord-subheading"><Network size={17}/> C++ on-demand shortest path</div>
        <p className="ord-muted">Exact compound-participation BFS over the local SQLite index. Multi-reactant availability is not guaranteed. Search results are complete only when no resource limit was reached.</p>
        <label htmlFor="ord-path-from">Starting indexed SMILES</label>
        <div className="ord-query-row">
          <input id="ord-path-from" type="text" value={pathFrom} maxLength={512}
            onChange={e=>{setPathFrom(e.target.value);setPathResult(null);}} placeholder="e.g. CCO"/>
        </div>
        <label htmlFor="ord-path-to">Target indexed SMILES</label>
        <div className="ord-query-row">
          <input id="ord-path-to" type="text" value={pathTo} maxLength={512}
            onChange={e=>{setPathTo(e.target.value);setPathResult(null);}} placeholder="e.g. CC=O"/>
          <button disabled={!!busy||!pathFrom.trim()||!pathTo.trim()}
            onClick={()=>action("route",async()=>{
              setPathResult(await api.ordPath(pathFrom.trim(),pathTo.trim(),2500));
            })}>{busy==="route"?"Searching…":"Find indexed path"}</button>
        </div>
        {pathResult&&<div className="ord-reaction">
          <strong>{pathResult.found
            ? "Shortest participation path: "+pathResult.hopCount+" hops"
            : pathResult.complete ? "No path in indexed dataset"
              : "Search incomplete — "+pathResult.limitReason}</strong>
          <p className="ord-muted">Expanded {fmt(pathResult.metrics?.expanded)} compounds ·
            {fmt(pathResult.metrics?.sqlQueries)} SQLite queries ·
            {fmt(pathResult.metrics?.cacheHits)} cache hits ·
            {fmt(pathResult.metrics?.elapsedMs)} ms</p>
          {pathResult.found&&<ol>
            {(pathResult.steps||[]).map((step,i)=><li key={step.recordId+"-"+i}>
              <code>{step.from}</code> → <code>{step.to}</code> via <strong>{step.ordId}</strong>
            </li>)}
          </ol>}
          {!pathResult.complete&&<p className="ord-muted">Resource limit reached. This does not establish that no route exists.</p>}
        </div>}
      </div>
      {results.length > 0 && <div className="ord-results">
        <h3>Matching reactions <span>{results.length} displayed</span></h3>
        {results.map(item => <button key={item.id} className={selected?.reaction?.id === item.id ? "ord-result selected" : "ord-result"}
          onClick={() => chooseReaction(item.id)}>
          <span className="ord-record-id">{item.ordId}</span>
          <code>{item.smiles || "No reaction SMILES provided"}</code>
          <span className="ord-go">Inspect →</span>
        </button>)}
      </div>}
      {selected && <div className="ord-reaction">
        <div className="ord-subheading"><FlaskConical size={17}/> Reaction details</div>
        <strong>{selected.reaction.ordId}</strong>
        <p className="ord-smiles">{selected.reaction.smiles || "No structural reaction SMILES in source"}</p>
        <div className="ord-role-groups">
          {["reactant", "agent", "product"].map(role =>
            <div key={role}><h4>{role}s</h4>
              {selected.participants.filter(p => p.role === role).map(p =>
                <button key={role+p.smiles} title="Explore related reactions"
                  onClick={() => showNeighborhood(p.smiles)}>{p.smiles} <Network size={13}/></button>)}
            </div>)}
        </div>
        <p className="ord-muted">Select a compound to explore nearby records as a compound–reaction network. Multiple reactants remain attached to one reaction node.</p>
      </div>}
      {neighborhood && <div className="ord-graph">
        <div className="ord-subheading"><Network size={17}/> Reaction participation network</div>
        <p className="ord-muted">{fmt(neighborhood.reactions)} source reactions · {fmt(neighborhood.nodes.length)} visible nodes ·
          reactants → reaction nodes → products</p>
        {neighborhood.nodes.length ? <div className="ord-network">
          <SigmaNetwork network={neighborhood}
            onSelectCompound={(name) => {
              if (!String(name).startsWith("ord-")) showNeighborhood(name);
            }}/>
        </div> : <p className="ord-muted">No indexed relationships for this SMILES string.</p>}
      </div>}
    </> : <div className="ord-setup">
      <div className="ord-subheading"><Database size={20}/> Enable the large reaction library</div>
      <p>The optional ORD index has not been installed on this machine. Open Terminal in your ChemPath folder:</p>
      <pre>{setupCommands}</pre>
      <p>For the complete official dataset, run <code>python3 scripts/import-ord.py --all</code>.
        Keep several gigabytes of free disk space available. No dataset import is required to use the existing DSA algorithms.</p>
      <button onClick={() => action("refresh", refresh)} disabled={!!busy}>
        <RefreshCw size={15}/> Check database again
      </button>
    </div>}
    {error && <p className="ord-error" role="alert">{error}</p>}
    <footer className="ord-footer">
      <span>Source: <a href="https://huggingface.co/datasets/open-reaction-database/ord-data"
        target="_blank" rel="noreferrer">Open Reaction Database <ExternalLink size={12}/></a></span>
      <span>ORD data CC BY-SA 4.0 · Graph relationships are not verified syntheses</span>
    </footer>
  </section>;
}
