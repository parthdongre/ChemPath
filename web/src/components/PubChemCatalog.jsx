import {useCallback,useEffect,useRef,useState} from "react";
import {Database,Search,ExternalLink,ChevronRight,RefreshCw,Copy} from "lucide-react";
import {api} from "../api.js";
import "./PubChemCatalog.css";

/**
 * PubChem is intentionally a separate indexed structure catalog. Displaying
 * millions of structures does not claim connected reaction graph edges.
 */
export default function PubChemCatalog(){
  const [status,setStatus]=useState(null);
  const [query,setQuery]=useState("");
  const [items,setItems]=useState([]);
  const [cursor,setCursor]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState(null);
  const requestNumber=useRef(0);
  const refresh=useCallback(()=>{
    api.catalogStatus().then(setStatus).catch(err=>setError(err.message));
  },[]);
  useEffect(()=>{
    // Import happens outside the browser. Recheck after returning from the
    // terminal, and periodically while the Data Library remains visible.
    refresh();
    const onFocus=()=>refresh();
    window.addEventListener("focus",onFocus);
    const poll=window.setInterval(()=>{
      if(document.visibilityState==="visible")refresh();
    },20000);
    return ()=>{
      window.removeEventListener("focus",onFocus);
      window.clearInterval(poll);
    };
  },[refresh]);
  const load=useCallback(async(nextQuery="",after=null,append=false)=>{
    const request=++requestNumber.current;
    setBusy(true);setError("");
    try{
      const page=await api.catalogSearch(nextQuery,24,after);
      if(request!==requestNumber.current)return;
      setItems(old=>append?[...old,...page.matches]:page.matches);
      setCursor(page.nextAfter);
    }catch(err){
      if(request===requestNumber.current)setError(err.message);
    }finally{
      if(request===requestNumber.current)setBusy(false);
    }
  },[]);
  useEffect(()=>{
    if(!status?.available)return undefined;
    const timer=setTimeout(()=>{setSelected(null);load(query.trim());},query.trim()?210:0);
    return ()=>clearTimeout(timer);
  },[query,status?.available,status?.compounds,load]);
  return <section className="pubchem-catalog" aria-label="PubChem compound catalog">
    <header className="pubchem-heading">
      <div className="pubchem-symbol"><Database size={19}/></div>
      <div>
        <span className="pubchem-overline">PUBLIC CHEMICAL STRUCTURE INDEX</span>
        <h2>PubChem compound catalog</h2>
        <p>8 million real CID/SMILES records by default · searchable without loading them into the graph</p>
      </div>
      <button type="button" onClick={refresh} className="pubchem-icon"
        aria-label="Refresh catalog status" title="Refresh status"><RefreshCw size={17}/></button>
    </header>
    <div className="pubchem-summary">
      <div>
        <span>INSTALLED RECORDS</span>
        <strong aria-live="polite">{status?.available?
          status.compounds.toLocaleString():status?"Not installed":"Checking…"}</strong>
      </div>
      <div>
        <span>CATALOG TARGET</span>
        <strong>{status?.scope==="full"?"Full corpus":(status?.target??8000000).toLocaleString()}</strong>
      </div>
      <div>
        <span>SOURCE</span>
        <strong>PubChem</strong>
      </div>
    </div>
    <p className="pubchem-disclaimer">
      This is a structure catalog, not 8 million verified reaction pathways.
      The curated C++ graph and imported Rhea/ORD reaction sources remain separate.
    </p>
    {status&&!status.meetsTarget&&<div className="pubchem-install">
      <strong>{status.available?"Upgrade your compound catalog to 8 million":"Install the 8-million-compound library"}</strong>
      <p>{status.available?
        `You currently have ${status.compounds.toLocaleString()} source records. Upgrade to 8 million genuine PubChem CIDs without losing your working catalog if the download fails.`:
        "From your ChemPath folder, stream the official PubChem CID–SMILES source into a local SQLite index. The graph and reaction data stay unchanged."
      }</p>
      <div className="pubchem-command">
        <code>npm run data:8m</code>
        <button type="button" title="Copy install command"
          onClick={()=>navigator.clipboard?.writeText("npm run data:8m")}>
          <Copy size={15}/> Copy
        </button>
      </div>
      <small>The importer keeps existing data until the new 8M index passes verification. After a Git pull, an installed catalog stays on disk. For an optional full PubChem CID–SMILES import, use <code>npm run data:full</code>.</small>
    </div>}
    {status?.available&&<>
      <label className="pubchem-search">
        <Search size={17}/>
        <input type="search" aria-label="Search PubChem CID or SMILES prefix"
          placeholder="Find a PubChem CID or SMILES prefix, e.g. CID 2244 or CCO…"
          value={query} onChange={event=>setQuery(event.target.value)} maxLength={180}/>
        <kbd>CID / SMILES</kbd>
      </label>
      {error&&<p className="pubchem-error" role="alert">{error}</p>}
      <div className="pubchem-table-label">
        <span>{query?"SEARCH RESULTS":"BROWSE CATALOG"}</span>
        <span>{busy?"Searching…":items.length+" loaded"}</span>
      </div>
      <div className="pubchem-list">
        {items.map(item=><button type="button" className={"pubchem-item"+(selected?.cid===item.cid?" is-selected":"")}
          key={item.cid} onClick={()=>setSelected(value=>value?.cid===item.cid?null:item)}>
          <span className="pubchem-cid">CID {item.cid}</span>
          <code title={item.smiles}>{item.smiles}</code>
          <ChevronRight size={15}/>
        </button>)}
        {!busy&&items.length===0&&<p className="pubchem-empty">
          No compounds matched. Search by exact PubChem CID or the beginning of a SMILES structure.
        </p>}
      </div>
      {selected&&<div className="pubchem-selected">
        <span>COMPOUND RECORD · PUBCHEM CID {selected.cid}</span>
        <code>{selected.smiles}</code>
        <p>Structure registered in PubChem. Reaction connectivity is not established by this catalog.</p>
        <a href={selected.url} target="_blank" rel="noopener noreferrer">
          View source compound <ExternalLink size={14}/>
        </a>
      </div>}
      {!query&&cursor!=null&&<button type="button" className="pubchem-more"
        disabled={busy} onClick={()=>load("",cursor,true)}>
        {busy?"Loading…":"Load next 24 compounds"} <ChevronRight size={15}/>
      </button>}
    </>}
    {error&&!status?.available&&<p className="pubchem-error" role="alert">{error}</p>}
    <footer className="pubchem-attribution">
      <span>Data source: <a href="https://pubchem.ncbi.nlm.nih.gov/docs/downloads"
        target="_blank" rel="noopener noreferrer">NCBI PubChem <ExternalLink size={12}/></a></span>
      <span>{status?.available?
        (status.scope==="full"?"Complete local CID–SMILES corpus":
          status.meetsTarget?"8M local catalog ready":"Existing catalog · upgrade available"):
        "External dataset not bundled with Git"}</span>
    </footer>
  </section>;
}
