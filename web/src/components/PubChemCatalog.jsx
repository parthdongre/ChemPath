import {useCallback,useEffect,useRef,useState} from "react";
import {Check,ChevronRight,Copy,Download,ExternalLink,RefreshCw,Search} from "lucide-react";
import {api} from "../api.js";
import {Alert,AlertDescription,AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card,CardAction,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import {Empty,EmptyDescription,EmptyHeader,EmptyTitle} from "@/components/ui/empty";
import {InputGroup,InputGroupAddon,InputGroupInput} from "@/components/ui/input-group";
import {Kbd} from "@/components/ui/kbd";
import {Spinner} from "@/components/ui/spinner";
import {Table,TableBody,TableCell,TableRow} from "@/components/ui/table";
import {AnnotatedText} from "@/components/ui/annotated-text";
import {Hint,SectionHeader,Stat,StatStrip} from "@/components/studio/primitives.jsx";

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
  const [copied,setCopied]=useState(false);
  const copyCommand=()=>{
    navigator.clipboard?.writeText("npm run data:8m").then(()=>{
      setCopied(true);window.setTimeout(()=>setCopied(false),1600);
    }).catch(()=>{});
  };
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
  const installed=status?.available;
  return <section className="pubchem-catalog mt-12" aria-label="PubChem compound catalog">
    <SectionHeader title="PubChem structures"
      description={<>A local SQLite index of PubChem CID and SMILES records, searchable without loading them
        into the graph. These are <AnnotatedText variant="underline" color="text-route">structures only</AnnotatedText> and
        add no reaction edges.</>}
      actions={<Hint label="Refresh catalog status">
        <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh catalog status"><RefreshCw/></Button>
      </Hint>}/>
    <StatStrip className="mb-3">
      <Stat label="Installed" value={<span aria-live="polite">{installed?
        status.compounds.toLocaleString():status?"Not installed":"Checking…"}</span>}/>
      <Stat label="Target" value={status?.scope==="full"?"Full corpus":(status?.target??8000000).toLocaleString()}/>
      <Stat label="Source" value="NCBI PubChem"/>
    </StatStrip>

    {status&&!status.meetsTarget&&<Alert className="border-l-2 border-l-route">
      <Download/>
      <AlertTitle>{installed?"Upgrade the catalog to 8 million compounds":"Install the 8-million-compound catalog"}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{installed?
          `You have ${status.compounds.toLocaleString()} records. The upgrade keeps your working catalog if the download fails.`:
          "From the ChemPath folder, stream the official PubChem CID–SMILES file into a local SQLite index. Graph and reaction data stay unchanged."}</p>
        <div className="flex max-w-sm items-center justify-between gap-2 rounded-lg border bg-muted/50 py-1 pr-1 pl-3">
          <code className="font-mono text-[13px] text-foreground">npm run data:8m</code>
          <Button size="xs" variant="ghost" onClick={copyCommand}>{copied?<Check/>:<Copy/>}{copied?"Copied":"Copy"}</Button>
        </div>
        <p className="text-xs">The new index replaces the old one only after it passes verification. For the full corpus,
          run <Kbd className="font-mono">npm run data:full</Kbd>.</p>
      </AlertDescription>
    </Alert>}

    {installed&&<div className="mt-4 space-y-2">
      <InputGroup>
        <InputGroupAddon><Search/></InputGroupAddon>
        <InputGroupInput type="search" aria-label="Search PubChem CID or SMILES prefix"
          placeholder="PubChem CID or SMILES prefix, e.g. CID 2244 or CCO"
          value={query} onChange={event=>setQuery(event.target.value)} maxLength={180}/>
        {busy&&<InputGroupAddon align="inline-end"><Spinner/></InputGroupAddon>}
      </InputGroup>
      {error&&<p className="text-[13px] text-destructive" role="alert">{error}</p>}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{query?"Search results":"Browsing by CID"}</span>
        <span className="tabular-nums">{items.length} loaded</span>
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border bg-card">
        <Table>
          <TableBody>
            {items.map(item=><TableRow key={item.cid} role="button" tabIndex={0}
              data-state={selected?.cid===item.cid?"selected":undefined}
              className="cursor-pointer data-[state=selected]:bg-route/10"
              onClick={()=>setSelected(value=>value?.cid===item.cid?null:item)}
              onKeyDown={event=>{if(event.key==="Enter"){setSelected(value=>value?.cid===item.cid?null:item);}}}>
              <TableCell className="w-28 font-medium tabular-nums">CID {item.cid}</TableCell>
              <TableCell className="max-w-0 truncate font-mono text-xs text-muted-foreground" title={item.smiles}>{item.smiles}</TableCell>
              <TableCell className="w-8"><ChevronRight className="size-4 text-muted-foreground"/></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        {!busy&&items.length===0&&<Empty className="py-8"><EmptyHeader>
          <EmptyTitle className="text-sm">No compounds matched</EmptyTitle>
          <EmptyDescription>Search by an exact CID or the beginning of a SMILES string.</EmptyDescription>
        </EmptyHeader></Empty>}
      </div>
      {selected&&<Card size="sm">
        <CardHeader>
          <CardDescription>PubChem CID {selected.cid}</CardDescription>
          <CardTitle className="font-mono text-[13px] font-normal break-all">{selected.smiles}</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <a href={selected.url} target="_blank" rel="noopener noreferrer">PubChem <ExternalLink data-icon="inline-end"/></a>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Registered structure. This catalog does not establish any reaction connectivity.
        </CardContent>
      </Card>}
      {!query&&cursor!=null&&<Button variant="outline" disabled={busy} onClick={()=>load("",cursor,true)}>
        {busy?"Loading…":"Load next 24"}<ChevronRight data-icon="inline-end"/>
      </Button>}
    </div>}
    {error&&!installed&&<p className="mt-3 text-[13px] text-destructive" role="alert">{error}</p>}
    <footer className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
      <span>Data source: <a className="underline underline-offset-3 hover:text-foreground" href="https://pubchem.ncbi.nlm.nih.gov/docs/downloads"
        target="_blank" rel="noopener noreferrer">NCBI PubChem</a></span>
      <span>{installed?
        (status.scope==="full"?"Complete local CID–SMILES corpus":
          status.meetsTarget?"8M local catalog ready":"Existing catalog · upgrade available"):
        "External dataset, not bundled with Git"}</span>
    </footer>
  </section>;
}
