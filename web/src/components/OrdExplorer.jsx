import { useEffect, useState } from "react";
import { Database, FlaskConical, Network, RefreshCw, Search } from "lucide-react";
import SigmaNetwork from "./SigmaNetwork.jsx";
import { api } from "../api.js";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { SectionHeader, Stat, StatStrip } from "@/components/studio/primitives.jsx";

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

  const installed = status?.available;
  return <section id="ord-database" className="ord-panel mt-12" aria-label="Open Reaction Database explorer">
    <SectionHeader title="Open Reaction Database"
      description="Search source reaction records from a local SQLite index and run C++ breadth-first search over it, without loading the corpus into the browser."
      actions={<Badge variant="outline" className="gap-1.5 font-normal">
        <span className={cn("size-1.5 rounded-full", installed ? "bg-success" : "bg-muted-foreground")}/>
        {installed ? "Indexed locally" : "Not installed"}
      </Badge>}/>

    {installed ? <div className="space-y-3">
      <StatStrip className="max-sm:grid-flow-row max-sm:grid-cols-2 max-sm:divide-x-0">
        <Stat label="Reaction records" value={fmt(status.reactions)}/>
        <Stat label="With reaction SMILES" value={fmt(status.withReactionSmiles)}/>
        <Stat label="Parquet files" value={fmt(status.importedFiles)}/>
        <Stat label="Licence" value="CC BY-SA 4.0"/>
      </StatStrip>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Search records</CardTitle>
          <CardDescription>SMILES prefixes are structure strings, not names. Try CCO, CC(=O) or an ORD identifier.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2 max-sm:flex-col" onSubmit={event => { event.preventDefault(); search(); }}>
            <InputGroup>
              <InputGroupAddon><Search/></InputGroupAddon>
              <InputGroupInput id="ord-query" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="e.g. CCO or ord-…" maxLength={180} className="font-mono"
                aria-label="Search molecular SMILES or an ORD reaction ID"/>
            </InputGroup>
            <Button type="submit" disabled={!!busy || query.trim().length < 2}>
              {busy === "search" && <Spinner data-icon="inline-start"/>}Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="size-4 text-muted-foreground"/>C++ on-demand shortest path</CardTitle>
          <CardDescription>Exact participation BFS over the SQLite index. A result is complete only when no resource limit was reached.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ord-path-from" className="text-xs text-muted-foreground">From (indexed SMILES)</Label>
              <Input id="ord-path-from" value={pathFrom} maxLength={512} className="font-mono"
                onChange={e=>{setPathFrom(e.target.value);setPathResult(null);}} placeholder="e.g. CCO"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ord-path-to" className="text-xs text-muted-foreground">To (indexed SMILES)</Label>
              <Input id="ord-path-to" value={pathTo} maxLength={512} className="font-mono"
                onChange={e=>{setPathTo(e.target.value);setPathResult(null);}} placeholder="e.g. CC=O"/>
            </div>
            <Button disabled={!!busy||!pathFrom.trim()||!pathTo.trim()}
              onClick={()=>action("route",async()=>{
                setPathResult(await api.ordPath(pathFrom.trim(),pathTo.trim(),2500));
              })}>{busy==="route"&&<Spinner data-icon="inline-start"/>}Find indexed path</Button>
          </div>
          {pathResult&&<Alert className={pathResult.found ? "border-l-2 border-l-route" : ""}>
            <AlertTitle>{pathResult.found
              ? `Shortest participation path: ${pathResult.hopCount} hops`
              : pathResult.complete ? "No path in the indexed dataset"
                : `Search incomplete: ${pathResult.limitReason}`}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="tabular-nums">Expanded {fmt(pathResult.metrics?.expanded)} compounds · {fmt(pathResult.metrics?.sqlQueries)} SQLite
                queries · {fmt(pathResult.metrics?.cacheHits)} cache hits · {fmt(pathResult.metrics?.elapsedMs)} ms</p>
              {pathResult.found&&<ol className="list-decimal space-y-1 pl-5 text-foreground">
                {(pathResult.steps||[]).map((step,i)=><li key={step.recordId+"-"+i}>
                  <code className="font-mono text-xs">{step.from}</code> → <code className="font-mono text-xs">{step.to}</code>
                  <span className="text-muted-foreground"> via {step.ordId}</span>
                </li>)}
              </ol>}
              {!pathResult.complete&&<p>A resource limit was reached, so this does not prove that no route exists.</p>}
            </AlertDescription>
          </Alert>}
        </CardContent>
      </Card>

      {results.length > 0 && <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex justify-between border-b bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium">Matching reactions</span>
          <span className="text-muted-foreground">{results.length} shown</span>
        </div>
        <Table>
          <TableBody>
            {results.map(item => <TableRow key={item.id} role="button" tabIndex={0}
              data-state={selected?.reaction?.id === item.id ? "selected" : undefined}
              className="cursor-pointer data-[state=selected]:bg-route/10"
              onClick={() => chooseReaction(item.id)}
              onKeyDown={event => { if (event.key === "Enter") chooseReaction(item.id); }}>
              <TableCell className="w-48 max-w-48 truncate font-medium">{item.ordId}</TableCell>
              <TableCell className="max-w-0 truncate font-mono text-xs text-muted-foreground">{item.smiles || "No reaction SMILES provided"}</TableCell>
              <TableCell className="w-20 text-right text-xs text-muted-foreground">Inspect</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>}

      {selected && <Card size="sm">
        <CardHeader>
          <CardDescription className="flex items-center gap-2"><FlaskConical className="size-3.5"/>Reaction details</CardDescription>
          <CardTitle className="break-all">{selected.reaction.ordId}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-xs leading-relaxed break-all text-muted-foreground">
            {selected.reaction.smiles || "No structural reaction SMILES in source"}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {["reactant", "agent", "product"].map(role =>
              <div key={role}>
                <h4 className="mb-1.5 text-xs font-medium text-muted-foreground capitalize">{role}s</h4>
                <div className="flex flex-col gap-1">
                  {selected.participants.filter(p => p.role === role).map(p =>
                    <Button key={role+p.smiles} variant="outline" size="sm" title="Explore related reactions"
                      className="h-auto justify-between py-1.5 text-left font-mono text-xs font-normal break-all whitespace-normal"
                      onClick={() => showNeighborhood(p.smiles)}>{p.smiles}<Network data-icon="inline-end"/></Button>)}
                </div>
              </div>)}
          </div>
          <p className="text-xs text-muted-foreground">Pick a compound to see nearby records as a compound–reaction network. Reactants stay attached to a single reaction node.</p>
        </CardContent>
      </Card>}

      {neighborhood && <Card size="sm">
        <CardHeader>
          <CardTitle>Reaction participation network</CardTitle>
          <CardDescription>{fmt(neighborhood.reactions)} source reactions · {fmt(neighborhood.nodes.length)} nodes ·
            reactants → reaction nodes → products</CardDescription>
        </CardHeader>
        <CardContent>
          {neighborhood.nodes.length ? <div className="relative h-[480px] overflow-hidden rounded-lg border max-sm:h-[340px]">
            <SigmaNetwork network={neighborhood}
              onSelectCompound={(name) => {
                if (!String(name).startsWith("ord-")) showNeighborhood(name);
              }}/>
          </div> : <p className="text-[13px] text-muted-foreground">No indexed relationships for this SMILES string.</p>}
        </CardContent>
      </Card>}
    </div> : <Alert>
      <Database/>
      <AlertTitle>Install the reaction index</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>The ORD index is optional and not installed on this machine. From the ChemPath folder, run:</p>
        <pre className="overflow-x-auto rounded-lg border bg-muted/50 px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground">{setupCommands}</pre>
        <p>For the complete dataset, run <Kbd className="font-mono">python3 scripts/import-ord.py --all</Kbd> and keep several gigabytes free. The DSA algorithms work without it.</p>
        <Button variant="outline" size="sm" onClick={() => action("refresh", refresh)} disabled={!!busy}>
          <RefreshCw data-icon="inline-start"/>Check again
        </Button>
      </AlertDescription>
    </Alert>}
    {error && <p className="mt-3 text-[13px] text-destructive" role="alert">{error}</p>}
    <footer className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
      <span>Source: <a className="underline underline-offset-3 hover:text-foreground"
        href="https://huggingface.co/datasets/open-reaction-database/ord-data" target="_blank" rel="noreferrer">Open Reaction Database</a></span>
      <span>ORD data CC BY-SA 4.0 · graph relationships are not verified syntheses</span>
    </footer>
  </section>;
}
