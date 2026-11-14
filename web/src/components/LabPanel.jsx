import { useEffect, useId, useMemo, useState } from "react";
import { Info, Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import { api } from "../api";
import NetworkGraph from "./NetworkGraph.jsx";
import Formula from "./Formula.jsx";
import { compoundLabel } from "../theme.js";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const groups = [
  {
    id: "learn",
    name: "Learn",
    tabs: [
      ["trace", "Execution"],
      ["components", "Components"],
      ["dependencies", "Dependencies"],
      ["trie", "Trie"]
    ]
  },
  {
    id: "optimize",
    name: "Optimize",
    tabs: [
      ["compare", "Comparison"],
      ["paths", "Routes"],
      ["constrained", "Constraints"],
      ["pareto", "Pareto"]
    ]
  },
  {
    id: "experiment",
    name: "Experiment",
    tabs: [
      ["bench", "Benchmarks"],
      ["sandbox", "Playground"]
    ]
  }
];
const number = x =>
  typeof x === "number" ? x.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";
const EVENT_LABELS = {
  heap_push: "Pushed onto the heap",
  settle: "Settled (shortest distance final)",
  relax: "Relaxing a reaction edge",
  enqueue: "Enqueued through a reaction",
  dequeue: "Dequeued",
  push_stack: "Pushed onto the stack",
  pop_stack: "Popped from the stack",
  complete: "Search complete",
  discover: "Discovered",
  back_edge: "Back edge",
  lowlink: "Low-link updated",
  scc_start: "Component started",
  scc_member: "Component member"
};

/** The reaction a trace step follows, shown large enough to read during playback. */
function CurrentReaction({ event, reactions, byId }) {
  const from = byId.get(event?.from),
    to = byId.get(event?.to);
  return (
    <Card size="sm" className="gap-3 border-route/40 bg-card ring-route/30">
      <CardHeader>
        <CardDescription className="text-[13px] font-medium text-route">
          {EVENT_LABELS[event?.type] || event?.type?.replaceAll("_", " ") || "—"}
        </CardDescription>
        {from && to ? (
          <CardTitle className="flex flex-wrap items-baseline gap-2 text-xl!">
            <Formula compound={from} />
            <span className="text-route">→</span>
            <Formula compound={to} />
          </CardTitle>
        ) : (
          <CardTitle className="text-base font-medium text-muted-foreground">
            {event?.type === "complete"
              ? "Traversal finished"
              : "This step does not follow a reaction edge"}
          </CardTitle>
        )}
        {from && to && (
          <p className="text-xs text-muted-foreground">
            {from.name} → {to.name}
          </p>
        )}
      </CardHeader>
      {reactions.length > 0 && (
        <CardContent className="space-y-2.5">
          {reactions.slice(0, 3).map(r => (
            <div key={r.id} className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] leading-snug font-semibold break-words">{r.reaction}</p>
                <Badge variant="outline" className="shrink-0 font-normal">
                  weight {r.cost}
                </Badge>
              </div>
              {r.equation && (
                <p className="mt-1.5 font-mono text-sm leading-relaxed break-words">{r.equation}</p>
              )}
              {r.conditions && (
                <p className="mt-1 text-[13px] text-muted-foreground">{r.conditions}</p>
              )}
            </div>
          ))}
          {reactions.length > 3 && (
            <Note className="text-xs">{reactions.length - 3} more reactions join this pair.</Note>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Final route from a finished trace, one large card per reaction. */
function RouteReactions({ route }) {
  if (!route?.found) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Final route · {route.steps} reactions · weight {route.totalCost}
      </p>
      <ol className="grid gap-2 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {route.reactionPath.map((r, i) => (
          <li
            key={r.reactionId + "-" + i}
            className="rounded-lg border border-l-2 border-l-route bg-card px-3.5 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-2 text-base font-semibold">
              <Formula compound={route.path[i]} />
              <span className="text-route">→</span>
              <Formula compound={route.path[i + 1]} />
            </div>
            <p className="mt-1 text-[15px] font-medium">{r.reaction}</p>
            {r.equation && (
              <p className="mt-1 font-mono text-sm break-words text-foreground/80">{r.equation}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {r.conditions} · weight {r.cost}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Metrics({ children }) {
  return (
    <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {children}
    </dl>
  );
}
function Metric({ title, value, unit = "" }) {
  return (
    <div className="bg-card px-3.5 py-2.5">
      <dt className="text-xs text-muted-foreground">{title}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">
        {number(value)}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </dd>
    </div>
  );
}
/** Labelled control; the id links the label to its input for accessibility. */
function LabField({ label, className = "", children }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-36 flex-1 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children(id)}
    </div>
  );
}
function Toolbar({ className = "", children }) {
  return <div className={cn("mb-4 flex flex-wrap items-end gap-3", className)}>{children}</div>;
}
function Note({ children, className = "" }) {
  return (
    <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}>{children}</p>
  );
}
function SectionTitle({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <Note className="mt-1 max-w-[80ch]">{children}</Note>}
    </div>
  );
}
function RunButton({ busy, children, ...props }) {
  return (
    <Button {...props} disabled={busy || props.disabled}>
      {busy && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  );
}
function Placeholder({ children }) {
  return (
    <Empty className="border border-dashed py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Info />
        </EmptyMedia>
        <EmptyTitle className="text-sm">Nothing to show yet</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function RouteView({ route }) {
  if (!route) return <Note>Run the query to see its result.</Note>;
  if (!route.found) return <Note>No directed route found.</Note>;
  return (
    <div>
      <Note>
        {route.steps} steps · weight {route.totalCost}
      </Note>
      <div className="my-2.5 flex flex-wrap items-center gap-1 text-[13px]">
        {(route.path || []).map((n, i) => (
          <span key={n.id + "-" + i} className="inline-flex items-baseline gap-1">
            <Formula compound={n} className="font-semibold" />
            <span className="text-xs text-muted-foreground">{n.name}</span>
            {i < route.path.length - 1 && <span className="mx-1 text-route">→</span>}
          </span>
        ))}
      </div>
      <div className="divide-y border-t">
        {(route.reactionPath || []).map((r, i) => (
          <details key={r.reactionId + "-" + i} className="py-2 text-[13px]">
            <summary className="cursor-pointer">
              {i + 1}. {r.reaction}
            </summary>
            <p className="mt-1 font-mono text-xs break-words text-foreground/80">{r.equation}</p>
            <p className="text-xs text-muted-foreground">
              {r.conditions} · weight {r.cost}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function LabPanel({ network, from, to, viewMode = "lab" }) {
  const [tab, setTab] = useState("trace"),
    [algorithm, setAlgorithm] = useState("dijkstra");
  const [trace, setTrace] = useState(null),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1),
    [comparison, setComparison] = useState(null);
  const [paths, setPaths] = useState(null),
    [components, setComponents] = useState(null);
  const [csr, setCsr] = useState(null),
    [synthetic, setSynthetic] = useState(null);
  const [nodeCount, setNodeCount] = useState(1000),
    [edgeCount, setEdgeCount] = useState(4000);
  const [seed, setSeed] = useState(42),
    [blocked, setBlocked] = useState(""),
    [sandbox, setSandbox] = useState(null);
  const [editMode, setEditMode] = useState("remove"),
    [editWeight, setEditWeight] = useState(2);
  const [editTarget, setEditTarget] = useState(""),
    [trieQuery, setTrieQuery] = useState("meth"),
    [trieMatches, setTrieMatches] = useState(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [blockedReactions, setBlockedReactions] = useState("");
  const [blockedCompounds, setBlockedCompounds] = useState("");
  const [knownReagents, setKnownReagents] = useState("");
  const [knownCatalysts, setKnownCatalysts] = useState("");
  const [strictUnknown, setStrictUnknown] = useState(false);
  const [constrainedResult, setConstrainedResult] = useState(null);
  const [paretoObjective, setParetoObjective] = useState("steps-cost");
  const [paretoResult, setParetoResult] = useState(null);
  const [availableInput, setAvailableInput] = useState("");
  const [feasibility, setFeasibility] = useState(null);
  useEffect(() => {
    setTab(viewMode === "compare" ? "compare" : "trace");
    setPlaying(false);
  }, [viewMode]);
  const byId = useMemo(() => new Map((network?.nodes || []).map(n => [n.id, n])), [network]);
  const sourceId = network?.nodes?.find(n => n.name === from)?.id;
  const outgoing = useMemo(
    () => (network?.edges || []).filter(e => e.source === sourceId).slice(0, 100),
    [network, sourceId]
  );
  useEffect(() => {
    setTrace(null);
    setPaths(null);
    setComparison(null);
    setSandbox(null);
    setFeasibility(null);
    setConstrainedResult(null);
    setParetoResult(null);
    setStep(0);
    setPlaying(false);
  }, [from, to]);
  useEffect(() => {
    if (!playing || !trace?.events?.length) return;
    const timer = window.setInterval(
      () => setStep(s => Math.min(s + 1, trace.events.length - 1)),
      Math.max(75, 650 / speed)
    );
    return () => window.clearInterval(timer);
  }, [playing, trace, speed]);
  useEffect(() => {
    if (trace && step >= trace.events.length - 1) setPlaying(false);
  }, [step, trace]);
  const execute = async fn => {
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const current = trace?.events?.[step];
  // Reactions by directed compound pair, so a trace step can name its edge.
  const edgesByPair = useMemo(() => {
    const index = new Map();
    for (const edge of network?.edges || []) {
      const key = edge.source + "-" + edge.target;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(edge);
    }
    return index;
  }, [network]);
  const currentReactions =
    current && current.from >= 0 && current.to >= 0
      ? edgesByPair.get(current.from + "-" + current.to) || []
      : [];
  const atEnd = Boolean(trace?.events?.length) && step >= trace.events.length - 1;
  const routeEdgeIds = useMemo(() => {
    const path = trace?.route?.path || [];
    return (trace?.route?.reactionPath || [])
      .map((r, i) =>
        path[i] && path[i + 1] ? path[i].id + "-" + path[i + 1].id + "-" + r.reactionId : null
      )
      .filter(Boolean);
  }, [trace]);
  const seen = useMemo(
    () =>
      new Set(
        (trace?.events || [])
          .slice(0, step + 1)
          .filter(e => e.node >= 0)
          .map(e => e.node)
      ),
    [trace, step]
  );
  const ranked = useMemo(
    () =>
      (components?.components || [])
        .map((ids, i) => ({ ids, i }))
        .sort((a, b) => b.ids.length - a.ids.length)
        .slice(0, 12),
    [components]
  );
  const focusedNetwork = useMemo(() => {
    if (!network || !trace?.events?.length) return null;
    const preferred = new Set();
    if (sourceId !== undefined) preferred.add(sourceId);
    const targetId = network.nodes.find(n => n.name === to)?.id;
    if (targetId !== undefined) preferred.add(targetId);
    (trace.route?.path || []).forEach(n => preferred.add(n.id));
    // Snapshot up to 140 vertices. The complete trace is still available
    // in the timeline, without forcing Cytoscape to relayout thousands.
    for (const event of trace.events) {
      if (preferred.size >= 140) break;
      if (event.node >= 0) preferred.add(event.node);
    }
    const nodes = network.nodes.filter(n => preferred.has(n.id));
    const edges = network.edges.filter(e => preferred.has(e.source) && preferred.has(e.target));
    return { nodes, edges };
  }, [network, trace, sourceId, to]);
  const dagNetwork = useMemo(() => {
    if (!components) return null;
    const selected = new Set();
    components.components.forEach((c, i) => {
      if (c.length > 1 && selected.size < 75) selected.add(i);
    });
    for (const [u, v] of components.dagEdges) {
      if (selected.size >= 110) break;
      if (selected.has(u) || selected.has(v)) {
        selected.add(u);
        selected.add(v);
      }
    }
    for (let i = 0; i < components.components.length && selected.size < 65; i++) selected.add(i);
    return {
      nodes: [...selected].map(i => ({
        id: i,
        name: "SCC " + i,
        formula: components.components[i].length + " nodes",
        category: "SCC"
      })),
      edges: components.dagEdges
        .filter(([u, v]) => selected.has(u) && selected.has(v))
        .map(([u, v]) => ({
          id: "dag-" + u + "-" + v,
          source: u,
          target: v,
          reaction: "SCC condensation edge",
          cost: 1
        }))
    };
  }, [components]);
  const maxVisited = Math.max(1, ...(comparison?.algorithms || []).map(x => x.visited));
  const visibleGroups = groups.filter(item =>
    viewMode === "compare" ? item.id === "optimize" : item.id !== "optimize"
  );
  const frontierName =
    algorithm === "dijkstra" ? "Priority queue" : algorithm === "bfs" ? "Queue" : "Stack";
  const changeTab = next => {
    setTab(next);
    setPlaying(false);
    setError("");
  };

  return (
    <Card className="lab-panel gap-0 py-0" id="algorithm-lab">
      <Tabs value={tab} onValueChange={changeTab} className="gap-0">
        <div className="overflow-x-auto border-b px-3">
          <TabsList variant="line" aria-label="Lab views" className="lab-tabs h-11 gap-4">
            {visibleGroups.map(item => (
              <div key={item.id} className="flex items-center gap-1" role="presentation">
                {visibleGroups.length > 1 && (
                  <span className="mr-1 text-[11px] font-medium text-muted-foreground/70">
                    {item.name}
                  </span>
                )}
                {item.tabs.map(([id, label]) => (
                  <TabsTrigger key={id} value={id} className="px-2">
                    {label}
                  </TabsTrigger>
                ))}
              </div>
            ))}
          </TabsList>
        </div>
        {error && (
          <Alert variant="destructive" className="mx-5 mt-4 w-auto" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <TabsContent value="trace" className="p-5">
          <Toolbar>
            <LabField label="Trace algorithm" className="max-w-xs">
              {id => (
                <NativeSelect
                  id={id}
                  value={algorithm}
                  className="w-full"
                  onChange={e => {
                    setAlgorithm(e.target.value);
                    setTrace(null);
                  }}
                >
                  <NativeSelectOption value="bfs">BFS · queue</NativeSelectOption>
                  <NativeSelectOption value="dfs">DFS · stack</NativeSelectOption>
                  <NativeSelectOption value="dijkstra">Dijkstra · min-heap</NativeSelectOption>
                  <NativeSelectOption value="tarjan">Tarjan · low-link stack</NativeSelectOption>
                </NativeSelect>
              )}
            </LabField>
            <RunButton
              busy={busy}
              onClick={() =>
                execute(async () => {
                  const result = await api.labTrace(algorithm, from, to);
                  setTrace(result);
                  setStep(0);
                })
              }
            >
              Generate C++ trace
            </RunButton>
            {trace && (
              <Badge variant="secondary" className="self-center">
                {trace.events.length} events{trace.truncated ? " · capped" : ""}
              </Badge>
            )}
          </Toolbar>
          {trace?.events?.length ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
                <Card size="sm" className="bg-muted/30">
                  <CardHeader>
                    <CardTitle>Focused graph and traversal</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {focusedNetwork && (
                      <div className="relative h-[460px] overflow-hidden rounded-lg border bg-canvas max-sm:h-[320px]">
                        <NetworkGraph
                          network={focusedNetwork}
                          visitedNodeIds={[...seen]}
                          activeNodeId={current?.node}
                          activeEdgeIds={currentReactions.map(r => r.id)}
                          highlightedEdgeIds={atEnd ? routeEdgeIds : []}
                          selectedNodeId={sourceId}
                          simulationRunning={true}
                        />
                      </div>
                    )}
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Processed nodes · {seen.size}
                      </p>
                      <div className="flex max-h-56 flex-wrap gap-1 overflow-auto">
                        {[...seen].slice(-75).map(id => (
                          <Badge
                            key={id}
                            variant={current?.node === id ? "default" : "outline"}
                            className={cn(
                              "font-normal",
                              current?.node === id && "bg-route text-primary-foreground"
                            )}
                          >
                            {compoundLabel(byId.get(id)) || id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex min-w-0 flex-col gap-3">
                  <CurrentReaction event={current} reactions={currentReactions} byId={byId} />
                  <Card size="sm" className="bg-muted/30">
                    <CardHeader>
                      <CardTitle>{frontierName}</CardTitle>
                      <CardDescription>
                        <b className="font-medium text-foreground">
                          {current?.type?.replaceAll("_", " ")}
                        </b>{" "}
                        · {byId.get(current?.node)?.name || current?.node}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <Note className="mb-2 text-xs">
                        Distance / index {current?.distance ?? "—"}
                        {current?.lowLink >= 0 ? " · low-link " + current.lowLink : ""}
                      </Note>
                      {(current?.frontier || []).length ? (
                        current.frontier.map(([id, value], i) => (
                          <div
                            key={i}
                            className="flex justify-between rounded-md bg-card px-2.5 py-1.5 text-[13px] tabular-nums"
                          >
                            <span className="font-medium">{compoundLabel(byId.get(id)) || id}</span>
                            <span className="text-muted-foreground">{value}</span>
                          </div>
                        ))
                      ) : (
                        <Note className="text-xs">Empty frontier</Note>
                      )}
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        Shows up to 16 frontier entries
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-1.5">
                <ButtonGroup>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Restart"
                    onClick={() => {
                      setStep(0);
                      setPlaying(false);
                    }}
                  >
                    <RotateCcw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Step back"
                    onClick={() => {
                      setPlaying(false);
                      setStep(s => Math.max(0, s - 1));
                    }}
                  >
                    <StepBack />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={playing ? "Pause" : "Play"}
                    onClick={() => {
                      if (step === trace.events.length - 1) setStep(0);
                      setPlaying(x => !x);
                    }}
                  >
                    {playing ? <Pause /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Step forward"
                    onClick={() => {
                      setPlaying(false);
                      setStep(s => Math.min(trace.events.length - 1, s + 1));
                    }}
                  >
                    <StepForward />
                  </Button>
                </ButtonGroup>
                <Slider
                  aria-label="Seek algorithm step"
                  min={0}
                  max={trace.events.length - 1}
                  step={1}
                  value={[step]}
                  onValueChange={([v]) => {
                    setPlaying(false);
                    setStep(v);
                  }}
                  className="min-w-24 flex-1 [&_[data-slot=slider-range]]:bg-route"
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {step + 1}/{trace.events.length}
                </span>
                <NativeSelect
                  size="sm"
                  aria-label="Playback speed"
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                >
                  {[0.5, 1, 2, 4].map(x => (
                    <NativeSelectOption key={x} value={x}>
                      {x}×
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {atEnd ? (
                <RouteReactions route={trace.route} />
              ) : (
                trace.route?.found && (
                  <Note className="mt-3 text-xs">
                    Play to the last step to reveal the final route and its reactions.
                  </Note>
                )
              )}
            </>
          ) : (
            <Placeholder>
              Pick an algorithm and generate a trace to step through its queue, stack or heap.
            </Placeholder>
          )}
        </TabsContent>

        <TabsContent value="compare" className="p-5">
          <Toolbar>
            <RunButton
              busy={busy}
              onClick={() =>
                execute(async () => {
                  setComparison(await api.labCompare(from, to));
                })
              }
            >
              Compare all 8 algorithms
            </RunButton>
            <Note className="self-center text-xs">
              Same graph and endpoints · separate C++ runs
            </Note>
          </Toolbar>
          {comparison ? (
            <div className="lab-compare overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="lab-compare-row heading">
                    <TableHead>Algorithm</TableHead>
                    <TableHead className="w-[40%]">Visited</TableHead>
                    <TableHead className="text-right">Runtime (µs)</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.algorithms.map(a => (
                    <TableRow key={a.name} className="lab-compare-row">
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-route"
                              style={{ width: Math.max(2, (a.visited / maxVisited) * 100) + "%" }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                            {a.visited}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {number(a.microseconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.found ? a.cost : <span className="text-muted-foreground">No path</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Note className="border-t px-3 py-2 text-xs">
                BFS cost is hop count. Weighted algorithms minimise graph weight. Timings exclude
                network and I/O.
              </Note>
            </div>
          ) : (
            <Placeholder>
              Runs BFS, bidirectional BFS, Dijkstra, A*, Dial, Bellman-Ford, bidirectional Dijkstra
              and the pivot-frontier hybrid on {from} → {to}.
            </Placeholder>
          )}
        </TabsContent>

        <TabsContent value="paths" className="p-5">
          <Toolbar>
            <RunButton
              busy={busy}
              onClick={() =>
                execute(async () => {
                  setPaths(await api.labPaths(from, to, 3));
                })
              }
            >
              Find 3 shortest loopless routes
            </RunButton>
            <Note className="self-center text-xs">Yen's algorithm</Note>
          </Toolbar>
          {paths ? (
            paths.routes.length ? (
              <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
                {paths.routes.map((r, i) => (
                  <Card key={i} size="sm" className="bg-muted/30">
                    <CardHeader>
                      <CardTitle>Route {i + 1}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RouteView route={r} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Note>No path found.</Note>
            )
          ) : (
            <Placeholder>
              Yen's algorithm returns up to three loopless routes ordered by graph weight.
            </Placeholder>
          )}
        </TabsContent>

        <TabsContent value="components" className="p-5">
          <Toolbar>
            <RunButton
              busy={busy}
              onClick={() =>
                execute(async () => {
                  setComponents(await api.labComponents());
                })
              }
            >
              Build SCC condensation DAG
            </RunButton>
            <Note className="self-center text-xs">Tarjan + DSU + topological ordering</Note>
          </Toolbar>
          {components ? (
            <>
              {dagNetwork && (
                <div className="relative mb-4 h-[360px] overflow-hidden rounded-lg border bg-canvas">
                  <NetworkGraph network={dagNetwork} />
                </div>
              )}
              <Metrics>
                <Metric title="Strong components" value={components.components.length} />
                <Metric title="Weak components" value={components.weakCount} />
                <Metric title="Condensation edges" value={components.dagEdges.length} />
                <Metric title="Topological nodes" value={components.topological.length} />
              </Metrics>
              <SectionTitle title="Largest strongly connected regions" />
              <div className="mb-4 grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {ranked.map(c => (
                  <Card key={c.i} size="sm" className="gap-1 bg-muted/30">
                    <CardHeader>
                      <CardDescription>SCC #{c.i}</CardDescription>
                      <CardTitle>{c.ids.length} nodes</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs break-words text-muted-foreground">
                      {c.ids
                        .slice(0, 5)
                        .map(id => compoundLabel(byId.get(id)) || id)
                        .join(" · ")}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Note>
                The condensation graph is a DAG. DSU independently counts weakly connected
                components.
              </Note>
            </>
          ) : (
            <Placeholder>
              Collapse each strongly connected component into one node to get a DAG.
            </Placeholder>
          )}
        </TabsContent>

        <TabsContent value="bench" className="p-5">
          <Toolbar>
            <RunButton
              busy={busy}
              onClick={() =>
                execute(async () => {
                  setCsr(await api.labCsr());
                })
              }
            >
              Benchmark CSR vs adjacency lists
            </RunButton>
          </Toolbar>
          {csr && (
            <Metrics>
              <Metric title="Adjacency memory" value={csr.adjacencyBytes} unit="bytes" />
              <Metric title="CSR memory" value={csr.csrBytes} unit="bytes" />
              <Metric title="Adjacency traversal" value={csr.adjacencyUs} unit="µs" />
              <Metric title="CSR traversal" value={csr.csrUs} unit="µs" />
            </Metrics>
          )}
          <Card size="sm" className="mt-2 bg-muted/30">
            <CardHeader>
              <CardTitle>Seeded synthetic graph</CardTitle>
              <CardDescription>
                Random directed graph for controlled BFS and Dijkstra timing. Not chemistry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Toolbar className="mb-0">
                <LabField label="Nodes" className="min-w-24">
                  {id => (
                    <Input
                      id={id}
                      type="number"
                      min="2"
                      max="25000"
                      value={nodeCount}
                      onChange={e => setNodeCount(Number(e.target.value))}
                    />
                  )}
                </LabField>
                <LabField label="Edges" className="min-w-24">
                  {id => (
                    <Input
                      id={id}
                      type="number"
                      min="1"
                      max="250000"
                      value={edgeCount}
                      onChange={e => setEdgeCount(Number(e.target.value))}
                    />
                  )}
                </LabField>
                <LabField label="Seed" className="min-w-24">
                  {id => (
                    <Input
                      id={id}
                      type="number"
                      value={seed}
                      onChange={e => setSeed(Number(e.target.value))}
                    />
                  )}
                </LabField>
                <RunButton
                  variant="outline"
                  busy={busy}
                  onClick={() =>
                    execute(async () =>
                      setSynthetic(await api.labSynthetic(nodeCount, edgeCount, seed))
                    )
                  }
                >
                  Generate and run
                </RunButton>
              </Toolbar>
              {synthetic && (
                <div className="mt-4">
                  <Metrics>
                    <Metric title="Reached" value={synthetic.reachable} />
                    <Metric title="Minimum hops" value={synthetic.shortestHops} />
                    <Metric title="BFS" value={synthetic.bfsUs} unit="µs" />
                    <Metric title="Dijkstra" value={synthetic.dijkstraUs} unit="µs" />
                  </Metrics>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trie" className="p-5">
          <Toolbar>
            <LabField label="Prefix to traverse" className="max-w-xs">
              {id => (
                <Input
                  id={id}
                  value={trieQuery}
                  onChange={e => setTrieQuery(e.target.value)}
                  placeholder="Compound prefix"
                />
              )}
            </LabField>
            <RunButton
              busy={busy}
              disabled={!trieQuery.trim()}
              onClick={() =>
                execute(async () => {
                  setTrieMatches((await api.search(trieQuery.trim())).matches || []);
                })
              }
            >
              Search C++ Trie
            </RunButton>
          </Toolbar>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-4">
            {[...trieQuery].map((letter, index, all) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {index === 0 ? "root" : "→"}
                </span>
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-md border bg-muted/50 font-mono text-[15px] font-semibold",
                    index === all.length - 1 && "border-route bg-route/10"
                  )}
                >
                  {letter.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
          <Note>
            Each character follows a hash-map child pointer. Terminal and descendant IDs give the
            matching compounds.
          </Note>
          {trieMatches && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {trieMatches.map(n => (
                <Badge key={n.id} variant="outline" className="gap-1.5 font-normal">
                  <Formula compound={n} className="font-semibold" />
                  <span className="text-muted-foreground">{n.name}</span>
                </Badge>
              ))}
              {!trieMatches.length && <Note>No compound starts with that prefix.</Note>}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sandbox" className="p-5">
          <Toolbar>
            <LabField label="Operation">
              {id => (
                <NativeSelect
                  id={id}
                  className="w-full"
                  value={editMode}
                  onChange={e => {
                    setEditMode(e.target.value);
                    setSandbox(null);
                  }}
                >
                  <NativeSelectOption value="remove">Remove directed edge</NativeSelectOption>
                  <NativeSelectOption value="replace">Change edge weight</NativeSelectOption>
                  <NativeSelectOption value="add">
                    Add hypothetical directed edge
                  </NativeSelectOption>
                </NativeSelect>
              )}
            </LabField>
            {editMode === "add" ? (
              <LabField label="Target for hypothetical edge">
                {id => (
                  <NativeSelect
                    id={id}
                    className="w-full"
                    value={editTarget}
                    onChange={e => setEditTarget(e.target.value)}
                  >
                    <NativeSelectOption value="">Current destination ({to})</NativeSelectOption>
                    {(network?.nodes || []).map(n => (
                      <NativeSelectOption key={n.id} value={n.id}>
                        {n.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </LabField>
            ) : (
              <LabField label={`Existing edge from ${from}`}>
                {id => (
                  <NativeSelect
                    id={id}
                    className="w-full"
                    value={blocked}
                    onChange={e => setBlocked(e.target.value)}
                  >
                    <NativeSelectOption value="">Select an outgoing edge</NativeSelectOption>
                    {outgoing.map(e => (
                      <NativeSelectOption key={e.id} value={e.id}>
                        {byId.get(e.target)?.name || e.target} · {e.reaction}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </LabField>
            )}
            {editMode !== "remove" && (
              <LabField label="Graph weight" className="max-w-32">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    min="1"
                    max="1000"
                    value={editWeight}
                    onChange={e => setEditWeight(Number(e.target.value))}
                  />
                )}
              </LabField>
            )}
            <RunButton
              busy={busy}
              disabled={editMode !== "add" && !blocked}
              onClick={() =>
                execute(async () => {
                  if (editMode === "remove") {
                    const e = outgoing.find(x => x.id === blocked);
                    if (!e) throw new Error("Select an edge");
                    setSandbox(await api.labPlayground(from, to, e.source, e.target, e.reactionId));
                  } else {
                    const e = outgoing.find(x => x.id === blocked);
                    if (editMode === "replace" && !e) throw new Error("Select an edge");
                    const targetNode = network?.nodes?.find(n => n.name === to);
                    const targetId = editTarget ? Number(editTarget) : targetNode?.id;
                    if (editMode === "add" && (sourceId === undefined || targetId === undefined))
                      throw new Error("Select two compounds");
                    setSandbox(
                      await api.labEdit(
                        from,
                        to,
                        editMode,
                        editMode === "add" ? sourceId : e.source,
                        editMode === "add" ? targetId : e.target,
                        editMode === "add" ? -2 : e.reactionId,
                        editWeight
                      )
                    );
                  }
                })
              }
            >
              Recompute route
            </RunButton>
          </Toolbar>
          <Note>
            Hypothetical edges are graph-only demonstrations, not real reactions. The original data
            is never modified.
          </Note>
          {sandbox && (
            <div className="mt-4">
              <RouteView route={sandbox.route} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="dependencies" className="p-5">
          <SectionTitle title="Multi-reactant AND-dependency closure">
            A reaction activates only once all of its reactants are available. This is reachability
            closure, not a guaranteed synthesis route.
          </SectionTitle>
          <Toolbar>
            <LabField
              label="Initially available compounds (semicolon-separated)"
              className="min-w-64"
            >
              {id => (
                <Input
                  id={id}
                  value={availableInput}
                  placeholder={from || "Water;Carbon Dioxide"}
                  onChange={event => setAvailableInput(event.target.value)}
                />
              )}
            </LabField>
            <RunButton
              busy={busy}
              disabled={!to}
              onClick={() =>
                execute(async () => {
                  setFeasibility(await api.feasible(availableInput.trim() || from, to));
                })
              }
            >
              Compute dependency closure
            </RunButton>
          </Toolbar>
          {feasibility && (
            <div className="space-y-3">
              <Metrics>
                <Metric title="Compounds available" value={feasibility.availableCount} />
                <Metric title="Reactions activated" value={feasibility.activatedCount} />
                <Metric title="Initially available" value={feasibility.initialCount} />
              </Metrics>
              <Alert className={feasibility.targetAvailable ? "border-route/50" : ""}>
                <AlertDescription>
                  Target <b className="font-medium text-foreground">{feasibility.target}</b>:{" "}
                  {feasibility.targetAvailable
                    ? "reachable with these available compounds"
                    : "not reachable under these dependencies"}
                  .
                </AlertDescription>
              </Alert>
              <details className="text-[13px]">
                <summary className="cursor-pointer">Discovered compounds (first 80)</summary>
                <Note className="mt-1">
                  {(feasibility.availableSample || []).map(c => c.name).join(" · ")}
                </Note>
              </details>
              <details className="text-[13px]">
                <summary className="cursor-pointer">Activated reactions (first 80)</summary>
                <div className="mt-1 space-y-0.5 text-muted-foreground">
                  {(feasibility.activationSample || []).map((r, i) => (
                    <p key={r.reactionId + "-" + i}>
                      {r.name}
                      {r.reverse ? " (reverse)" : ""}
                    </p>
                  ))}
                </div>
              </details>
              {feasibility.truncatedSample && (
                <Note>Preview limited to 80 results. C++ evaluated every reaction.</Note>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="constrained" className="p-5">
          <SectionTitle title="Constrained shortest paths and alternatives">
            Filtered Dijkstra and Yen's loopless K routes over the participation graph. Reagent and
            catalyst requirements must be annotated; missing metadata is unknown, not proof that
            nothing is needed.
          </SectionTitle>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LabField label="Blocked reaction IDs">
              {id => (
                <Input
                  id={id}
                  value={blockedReactions}
                  placeholder="e.g. 3,12"
                  onChange={e => setBlockedReactions(e.target.value)}
                />
              )}
            </LabField>
            <LabField label="Blocked compound IDs">
              {id => (
                <Input
                  id={id}
                  value={blockedCompounds}
                  placeholder="e.g. 42"
                  onChange={e => setBlockedCompounds(e.target.value)}
                />
              )}
            </LabField>
            <LabField label="Available reagents">
              {id => (
                <Input
                  id={id}
                  value={knownReagents}
                  placeholder="water;ethanol"
                  onChange={e => setKnownReagents(e.target.value)}
                />
              )}
            </LabField>
            <LabField label="Available catalysts">
              {id => (
                <Input
                  id={id}
                  value={knownCatalysts}
                  placeholder="platinum"
                  onChange={e => setKnownCatalysts(e.target.value)}
                />
              )}
            </LabField>
          </div>
          <Toolbar>
            <div className="flex items-center gap-2">
              <Checkbox
                id="lab-strict-unknown"
                checked={strictUnknown}
                onCheckedChange={v => setStrictUnknown(v === true)}
              />
              <Label htmlFor="lab-strict-unknown" className="font-normal">
                Reject reactions with unknown requirements
              </Label>
            </div>
            <RunButton
              busy={busy}
              disabled={!from || !to}
              className="ml-auto"
              onClick={() =>
                execute(async () => {
                  const list = text =>
                    text.trim() ? text.split(",").map(v => Number(v.trim())) : [];
                  const names = text =>
                    text.trim()
                      ? text
                          .split(";")
                          .map(v => v.trim())
                          .filter(Boolean)
                      : [];
                  setConstrainedResult(
                    await api.constrained({
                      source: from,
                      target: to,
                      k: 3,
                      blockedReactionIds: list(blockedReactions),
                      blockedCompoundIds: list(blockedCompounds),
                      availableReagents: names(knownReagents),
                      availableCatalysts: names(knownCatalysts),
                      unknownRequirements: strictUnknown ? "strict" : "allow"
                    })
                  );
                })
              }
            >
              Find constrained routes
            </RunButton>
          </Toolbar>
          {constrainedResult && (
            <div className="space-y-3">
              <Note>
                Requirements known for {constrainedResult.knownRequirementReactions}/
                {constrainedResult.totalReactions} reactions. Unknown requirements{" "}
                {constrainedResult.unknownRequirementsAllowed ? "allowed" : "excluded"}.
              </Note>
              {(constrainedResult.routes || []).length ? (
                constrainedResult.routes.map((route, i) => (
                  <Card key={i} size="sm" className="bg-muted/30">
                    <CardHeader>
                      <CardTitle>Alternative {i + 1}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RouteView route={route} />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Note>No route satisfies these constraints.</Note>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pareto" className="p-5">
          <SectionTitle title="Multi-objective Pareto shortest paths">
            Multi-label Dijkstra keeps every route that no other route beats on both reaction count
            and graph weight. The reagent objective only counts reactions with explicit requirement
            metadata.
          </SectionTitle>
          <Toolbar>
            <LabField label="Objectives" className="max-w-xs">
              {id => (
                <NativeSelect
                  id={id}
                  className="w-full"
                  value={paretoObjective}
                  onChange={e => setParetoObjective(e.target.value)}
                >
                  <NativeSelectOption value="steps-cost">
                    Reaction count + graph weight
                  </NativeSelectOption>
                  <NativeSelectOption value="steps-cost-reagents">
                    Add known reagent occurrences
                  </NativeSelectOption>
                </NativeSelect>
              )}
            </LabField>
            <RunButton
              busy={busy}
              disabled={!from || !to}
              onClick={() =>
                execute(async () => {
                  setParetoResult(await api.pareto(from, to, paretoObjective, 30000, 8));
                })
              }
            >
              Compute Pareto frontier
            </RunButton>
          </Toolbar>
          {paretoResult && (
            <div className="space-y-3">
              <Metrics>
                <Metric title="Non-dominated labels" value={paretoResult.nonDominatedCount} />
                <Metric title="Labels generated" value={paretoResult.labelsGenerated} />
                <Metric title="Labels expanded" value={paretoResult.labelsExpanded} />
              </Metrics>
              {!paretoResult.complete && (
                <Alert>
                  <AlertDescription>
                    Label budget reached. This is a partial frontier, not the complete Pareto set.
                  </AlertDescription>
                </Alert>
              )}
              {paretoResult.routesOmitted && (
                <Note>Only the first 8 non-dominated routes are shown.</Note>
              )}
              {paretoResult.reagentObjective && (
                <Note>
                  {paretoResult.skippedUnknownRequirements} unannotated transitions were excluded.
                </Note>
              )}
              {(paretoResult.routes || []).length ? (
                paretoResult.routes.map((p, i) => (
                  <Card key={i} size="sm" className="bg-muted/30">
                    <CardHeader>
                      <CardTitle>Route {i + 1}</CardTitle>
                      <CardDescription>
                        {p.steps} reactions · weight {p.graphCost}
                        {paretoResult.reagentObjective
                          ? " · " + p.knownReagentOccurrences + " reagent occurrences"
                          : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RouteView route={p.route} />
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Note>No matching route in this search mode.</Note>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
