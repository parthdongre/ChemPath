import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight, ArrowRight, BookOpen, Check, ChevronRight,
  Command, Database, FlaskConical, GitCompareArrows, Keyboard,
  Layers3, Menu, Moon, Network, PanelLeftClose, PanelLeftOpen,
  PanelRight, Play, Search, Sun, X
} from "lucide-react";

export const STUDIO_VIEWS = [
  { id: "explore", label: "Explore", icon: Network, description: "Interactive reaction network" },
  { id: "compare", label: "Compare", icon: GitCompareArrows, description: "Algorithm and route alternatives" },
  { id: "lab", label: "Laboratory", icon: FlaskConical, description: "Step-by-step graph algorithms" },
  { id: "data", label: "Data Library", icon: Database, description: "Compounds and source datasets" }
];

export function StudioSidebar({ view, onChange, collapsed, onToggle, stats }) {
  return <aside className={"studio-sidebar"+(collapsed?" is-collapsed":"")} aria-label="Studio navigation">
    <div className="studio-sidebar-head">
      {!collapsed&&<span className="studio-sidebar-heading">WORKSPACE</span>}
      <button type="button" className="studio-icon-btn" onClick={onToggle}
        aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}
        title={collapsed?"Expand sidebar":"Collapse sidebar"}>
        {collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}
      </button>
    </div>
    <nav className="studio-nav" aria-label="Primary">
      {STUDIO_VIEWS.map(({id,label,icon:Icon,description})=>
        <button key={id} type="button" className={"studio-nav-item"+(view===id?" is-active":"")}
          onClick={()=>onChange(id)} aria-current={view===id?"page":undefined}
          title={collapsed?label:description} data-studio-view={id}>
          <Icon size={18} strokeWidth={1.8}/>
          {!collapsed&&<span>{label}</span>}
          {!collapsed&&view===id&&<ChevronRight className="studio-nav-indicator" size={15}/>}
        </button>)}
    </nav>
    {!collapsed&&<div className="studio-sidebar-bottom">
      <div className="studio-dataset-label"><Layers3 size={15}/> CURATED NETWORK</div>
      <strong>{stats?.compounds?.toLocaleString()??"—"} <span>compounds</span></strong>
      <small>Participation graph · C++17</small>
    </div>}
  </aside>;
}

export function StudioTopbar({
  view, status, onSearch, onToggleSidebar, onToggleInspector,
  onToggleTheme, theme, inspectorOpen
}) {
  const label=STUDIO_VIEWS.find(item=>item.id===view)?.label??"Explore";
  const online=status?.includes("online");
  return <header className="studio-topbar">
    <div className="studio-brand">
      <button type="button" onClick={onToggleSidebar} className="studio-icon-btn studio-menu-btn"
        title="Toggle navigation" aria-label="Toggle navigation"><Menu size={18}/></button>
      <span className="studio-brand-icon" aria-hidden="true"><Network size={18} strokeWidth={2.1}/></span>
      <span className="studio-brand-name">ChemPath <span>Studio</span></span>
      <span className="studio-breadcrumb" aria-hidden="true"><ChevronRight size={14}/>{label}</span>
    </div>
    <div className="studio-top-actions">
      <button type="button" className="studio-top-search" onClick={onSearch}
        aria-label="Search commands and compounds">
        <Search size={15}/><span>Search anything</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className={"studio-engine-state"+(online?" is-online":"")} title={status}>
        <span className="studio-engine-dot"/>
        <span>{online?"Engine ready":"Engine offline"}</span>
      </div>
      <button type="button" className="studio-icon-btn" onClick={onToggleTheme}
        aria-label={theme==="dark"?"Use light appearance":"Use dark appearance"}
        title="Toggle appearance">{theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button>
      {view==="explore"&&<button type="button" className={"studio-icon-btn"+(inspectorOpen?" is-active":"")}
        onClick={onToggleInspector} aria-label={inspectorOpen?"Hide inspector":"Show inspector"}
        title="Toggle inspector"><PanelRight size={18}/></button>}
    </div>
  </header>;
}

const commands=[
  {id:"explore",title:"Explore reaction network",hint:"Workspace",icon:Network},
  {id:"compare",title:"Compare graph algorithms",hint:"Workspace",icon:GitCompareArrows},
  {id:"lab",title:"Open algorithm laboratory",hint:"Workspace",icon:FlaskConical},
  {id:"data",title:"Browse compound data library",hint:"Workspace",icon:Database},
  {id:"find",title:"Find reaction pathway",hint:"Run",icon:ArrowRight}
];

export function StudioCommandPalette({
  open,onClose,onNavigate,compounds,onSelectSource,onSelectTarget,onFind
}) {
  const [query,setQuery]=useState("");
  const input=useRef(null);
  const dialog=useRef(null);
  useEffect(()=>{
    if(!open)return undefined;
    setQuery("");
    const token=requestAnimationFrame(()=>input.current?.focus());
    const onKey=(event)=>{
      if(event.key==="Escape"){event.preventDefault();onClose();}
      // Focus stays inside the modal when tabbing.
      if(event.key==="Tab"){
        const buttons=[...dialog.current.querySelectorAll("button:not([disabled]), input:not([disabled])")];
        if(!buttons.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener("keydown",onKey);
    return ()=>{cancelAnimationFrame(token);document.removeEventListener("keydown",onKey);};
  },[open,onClose]);
  const q=query.trim().toLowerCase();
  const filteredCommands=useMemo(()=>commands.filter(item=>!q||item.title.toLowerCase().includes(q)),[q]);
  const filteredCompounds=useMemo(()=>q.length<2?[]:compounds.filter(item=>
    (item.name+" "+item.formula+" "+item.category).toLowerCase().includes(q)).slice(0,7),[compounds,q]);
  if(!open)return null;
  const perform=(callback)=>{callback();onClose();};
  return <div className="studio-command-overlay" onPointerDown={event=>{
      if(event.target===event.currentTarget)onClose();
    }}>
    <section className="studio-command-dialog" role="dialog" aria-modal="true"
      aria-label="Command palette" ref={dialog}>
      <div className="studio-command-input">
        <Search size={19}/>
        <input ref={input} aria-label="Search commands and compounds" value={query}
          onChange={event=>setQuery(event.target.value)} placeholder="Search commands or compounds…"
          onKeyDown={event=>{
            if(event.key==="Enter"){
              const cmd=filteredCommands[0];
              if(cmd)perform(()=>cmd.id==="find"?onFind():onNavigate(cmd.id));
              else if(filteredCompounds[0])perform(()=>onSelectSource(filteredCompounds[0].name));
            }
          }}/>
        <button type="button" onClick={onClose} className="studio-icon-btn" aria-label="Close search"><X size={17}/></button>
      </div>
      <div className="studio-command-results">
        {filteredCommands.length>0&&<>
          <p className="studio-command-category">COMMANDS</p>
          {filteredCommands.map(({id,title,hint,icon:Icon})=><button key={id} type="button"
            className="studio-command-row" onClick={()=>perform(()=>id==="find"?onFind():onNavigate(id))}>
            <Icon size={17}/><span>{title}</span><small>{hint}</small><ArrowRight size={14}/>
          </button>)}
        </>}
        {filteredCompounds.length>0&&<>
          <p className="studio-command-category">COMPOUNDS</p>
          {filteredCompounds.map(item=><div className="studio-command-compound" key={item.id}>
            <div><strong>{item.formula||"—"}</strong><span>{item.name}</span></div>
            <button type="button" onClick={()=>perform(()=>onSelectSource(item.name))}>Set start</button>
            <button type="button" onClick={()=>perform(()=>onSelectTarget(item.name))}>Set target</button>
          </div>)}
        </>}
        {!filteredCommands.length&&!filteredCompounds.length&&<p className="studio-command-empty">No matching commands or compounds.</p>}
      </div>
      <div className="studio-command-footer"><Keyboard size={14}/> Enter to select · Esc to close
        <span>CHEMPATH STUDIO</span>
      </div>
    </section>
  </div>;
}

export function StudioInspectorHeading({
  compound, reaction, from, to, result, busy, running, onClose, onReplay, onSwap, onExplore, onExpand
}) {
  return <div className="studio-inspector-heading">
    <div className="studio-inspector-topline">
      <span>INSPECTOR</span>
      <button type="button" className="studio-icon-btn" onClick={onClose}
        aria-label="Close inspector" title="Close inspector"><X size={16}/></button>
    </div>
    {compound?<div className="studio-compound-card">
      <div className="studio-formula-block">{compound.formula||"—"}</div>
      <div className="studio-compound-info">
        <strong>{compound.name}</strong>
        <span>{compound.category||"Compound"}</span>
      </div>
    </div>:<div className="studio-compound-placeholder">Select a compound to inspect its graph relationships.</div>}
    {reaction&&<div className="studio-reaction-selection">
      <span>SELECTED REACTION</span>
      <strong>{reaction.reaction||"Reaction participation"}</strong>
      <p>{reaction.equation||"Directed graph edge"}</p>
      {reaction.conditions&&<small>{reaction.conditions}</small>}
      {reaction.cost!=null&&<small>Illustrative graph weight: {reaction.cost}</small>}
    </div>}
    <div className="studio-inspector-route">
      <div className="studio-inspector-route-caption">CURRENT QUERY</div>
      <div className="studio-inspector-route-endpoints">
        <span title={from}>{from}</span><ArrowRight size={14}/><span title={to}>{to}</span>
      </div>
    </div>
    <div className="studio-inspector-actions">
      <button type="button" onClick={onSwap} disabled={busy||running}
        title="Swap start and target compounds"><ArrowLeftRight size={15}/> Swap</button>
      <button type="button" onClick={onExplore} title="Open compound library"><BookOpen size={15}/> Library</button>
    </div>
    {compound&&onExpand&&
      <button type="button" className="studio-replay-action" onClick={onExpand}>
        <Layers3 size={14}/> Explore neighborhood <ChevronRight size={14}/>
      </button>}
    {result?.found&&!running&&
      <button type="button" className="studio-replay-action" onClick={onReplay} disabled={busy}>
        <Play size={14}/> Replay traversal <ChevronRight size={14}/>
      </button>}
  </div>;
}
