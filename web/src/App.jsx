import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import NetworkGraph from "./components/NetworkGraph.jsx";
import SigmaNetwork from "./components/SigmaNetwork.jsx";
import LabPanel from "./components/LabPanel.jsx";
import OrdExplorer from "./components/OrdExplorer.jsx";
import PubChemCatalog from "./components/PubChemCatalog.jsx";
import { StudioTopbar, StudioCommandPalette, StudioInspectorHeading } from "./components/StudioChrome.jsx";
import Formula from "./components/Formula.jsx";
import { ThemeContext, categoryColor } from "./theme.js";
import { ArrowLeftRight, ChevronsUpDown, Route, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnnotatedText } from "@/components/ui/annotated-text";
import { SplitFlapDisplay } from "@/components/ui/split-flap-display";
import { Hint, MapPanel, PageHeader, SectionHeader, Stat, StatStrip } from "@/components/studio/primitives.jsx";

const EMPTY_HIGHLIGHT = { nodes: [], edges: [] };
const MAX_SIMULATION_MS = 120_000;
const STEP_REPLAY_MS = 200;
const FINAL_HOLD_MS = 1_500;
const GRAPH_RENDER_LIMIT = 520;
const GRAPH_VISITED_FOCUS_LIMIT = 320;
const PICKER_RENDER_LIMIT = 220;
const DIRECTORY_PAGE_SIZE = 240;

const ELEMENT_SEARCH_NAMES = {
  C: "carbon",
  N: "nitrogen",
  S: "sulfur sulphur",
  P: "phosphorus",
  O: "oxygen",
  H: "hydrogen",
  F: "fluorine fluoride halogen",
  Cl: "chlorine chloride halogen",
  Br: "bromine bromide halogen",
  I: "iodine iodide halogen",
  Na: "sodium metal",
  K: "potassium metal",
  Li: "lithium metal",
  Mg: "magnesium metal",
  Ca: "calcium metal",
  Fe: "iron metal",
  Cu: "copper metal",
  Zn: "zinc metal",
  Ag: "silver metal"
};

const COMPOUND_ALIASES = {
  "Acetic Acid": ["Ethanoic Acid"],
  "Methanoic Acid": ["Formic Acid"],
  "Formaldehyde": ["Methanal"],
  "Acetaldehyde": ["Ethanal"],
  "Acetone": ["Propanone"],
  "Bicarbonate": ["Hydrogen Carbonate"],
  "Hydrogen Carbonate": ["Bicarbonate"],
  "Carbon Dioxide": ["CO2"],
  "Carbon Monoxide": ["CO"],
  "Sulfur Dioxide": ["SO2"],
  "Sulfur Trioxide": ["SO3"],
  "Nitric Oxide": ["NO"],
  "Nitrogen Dioxide": ["NO2"],
  "Water": ["H2O"],
  "Ammonia": ["NH3"],
  "Ammonium": ["NH4+"]
};

function normalizeSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit))
    .replace(/[^a-z0-9]+/g, "");
}

function compoundAliases(compound) {
  const aliases = [...(COMPOUND_ALIASES[compound.name] ?? [])];

  if (compound.name.includes("Acetate")) {
    aliases.push(compound.name.replace("Acetate", "Ethanoate"));
  }

  return aliases;
}

function subsequenceScore(text, query) {
  if (!query) return 0;

  let cursor = 0;
  let gaps = 0;
  for (const char of query) {
    const next = text.indexOf(char, cursor);
    if (next < 0) return -1;
    gaps += next - cursor;
    cursor = next + 1;
  }

  return Math.max(1, 180 - gaps);
}

function compoundSearchScore(compound, query) {
  const needle = normalizeSearch(query);
  if (!needle) return 0;

  const name = normalizeSearch(compound.name);
  const formula = normalizeSearch(compound.formula);
  const category = normalizeSearch(compound.category);
  const center = normalizeSearch(chemistryCenter(compound));
  const elements = formulaElements(compound.formula);
  const elementTerms = elements.flatMap((symbol) => [
    normalizeSearch(symbol),
    normalizeSearch(ELEMENT_SEARCH_NAMES[symbol] ?? symbol)
  ]);
  const aliases = compoundAliases(compound).map(normalizeSearch);
  const values = [name, formula, category, center, ...elementTerms, ...aliases];

  let best = -1;

  for (const value of values) {
    if (!value) continue;
    if (value === needle) best = Math.max(best, 1200);
    else if (value.startsWith(needle)) best = Math.max(best, 950 - Math.min(100, value.length - needle.length));
    else if (value.includes(needle)) best = Math.max(best, 700 - Math.min(150, value.indexOf(needle)));

    const fuzzy = subsequenceScore(value, needle);
    if (fuzzy >= 0) best = Math.max(best, fuzzy);
  }

  return best;
}

function rankedCompounds(compounds, query) {
  if (!query.trim()) {
    return [...compounds].sort((left, right) => left.name.localeCompare(right.name));
  }

  return compounds
    .map((compound) => ({ compound, score: compoundSearchScore(compound, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.compound.name.localeCompare(right.compound.name)
    )
    .map((entry) => entry.compound);
}

const CHEMISTRY_CENTERS = [
  "All",
  "Carbon",
  "Nitrogen",
  "Sulfur",
  "Phosphorus",
  "Halogen",
  "Metal",
  "Oxygen",
  "Other"
];

const METAL_ELEMENTS = new Set([
  "Li","Na","K","Rb","Cs","Be","Mg","Ca","Sr","Ba",
  "Al","Fe","Cu","Zn","Ag","Mn","Co","Ni","Cr","Sn","Pb"
]);

const HALOGEN_ELEMENTS = new Set(["F","Cl","Br","I"]);

function formulaElements(formula) {
  const elements = [];
  const seen = new Set();

  for (const match of String(formula ?? "").matchAll(/[A-Z][a-z]?/g)) {
    const symbol = match[0];
    if (!seen.has(symbol)) {
      seen.add(symbol);
      elements.push(symbol);
    }
  }

  return elements;
}

function chemistryCenter(compound) {
  const elements = formulaElements(compound.formula);
  const has = (symbol) => elements.includes(symbol);

  // This is a browsing classification, not a claim about molecular geometry.
  if (has("C")) return "Carbon";
  if (has("N")) return "Nitrogen";
  if (has("S")) return "Sulfur";
  if (has("P")) return "Phosphorus";
  if (elements.some((symbol) => HALOGEN_ELEMENTS.has(symbol))) return "Halogen";
  if (elements.some((symbol) => METAL_ELEMENTS.has(symbol))) return "Metal";
  if (has("O")) return "Oxygen";
  return "Other";
}

function matchesChemistryCenter(compound, center) {
  if (!center || center === "All") return true;

  const elements = formulaElements(compound.formula);
  const has = (symbol) => elements.includes(symbol);

  if (center === "Carbon") return has("C");
  if (center === "Nitrogen") return has("N");
  if (center === "Sulfur") return has("S");
  if (center === "Phosphorus") return has("P");
  if (center === "Halogen") {
    return elements.some((symbol) => HALOGEN_ELEMENTS.has(symbol));
  }
  if (center === "Metal") {
    return elements.some((symbol) => METAL_ELEMENTS.has(symbol));
  }
  if (center === "Oxygen") return has("O");

  return !(
    has("C") ||
    has("N") ||
    has("S") ||
    has("P") ||
    has("O") ||
    elements.some((symbol) => HALOGEN_ELEMENTS.has(symbol)) ||
    elements.some((symbol) => METAL_ELEMENTS.has(symbol))
  );
}

function relationshipLabel(compound, from, distanceByName) {
  if (!from) return "";
  if (compound.name === from) return "Start";
  const hops = distanceByName?.[compound.name];
  if (!Number.isFinite(hops)) return "—";
  return `${hops} ${hops === 1 ? "step" : "steps"}`;
}

/** C++ timings are often sub-millisecond; show them in µs so they fit and stay readable. */
function engineTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return { value: "—" };
  if (value < 1) return { value: Math.max(1, Math.round(value * 1000)).toLocaleString(), unit: "µs" };
  return { value: value.toFixed(value < 10 ? 2 : 1), unit: "ms" };
}

function FieldCaption({ children, hint }) {
  return <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
    {children}{hint && <span className="font-normal tabular-nums opacity-80">{hint}</span>}
  </span>;
}

/** Searchable compound combobox: shadcn Popover + Command with ChemPath ranking. */
function CompoundSelect({
  label,
  hint = "",
  value,
  onChange,
  compounds,
  disabled,
  distanceByName = null,
  className = ""
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [centerFilter, setCenterFilter] = useState("All");
  const distanceMap = useMemo(() => distanceByName ?? {}, [distanceByName]);
  const selected = useMemo(
    () => compounds.find((compound) => compound.name === value) ?? null,
    [compounds, value]
  );

  const filtered = useMemo(() => {
    const centered = compounds.filter((compound) => matchesChemistryCenter(compound, centerFilter));
    const ranked = rankedCompounds(centered, query);
    return ranked.sort((left, right) => {
      if (distanceByName) {
        const leftDistance = distanceMap[left.name];
        const rightDistance = distanceMap[right.name];
        const leftReachable = Number.isFinite(leftDistance);
        const rightReachable = Number.isFinite(rightDistance);
        if (leftReachable !== rightReachable) return leftReachable ? -1 : 1;
        if (leftReachable && rightReachable && leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
      }
      if (query.trim()) {
        return compoundSearchScore(right, query) - compoundSearchScore(left, query);
      }
      return left.name.localeCompare(right.name);
    });
  }, [compounds, query, centerFilter, distanceByName, distanceMap]);

  const visible = filtered.slice(0, PICKER_RENDER_LIMIT);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function choose(compound) {
    if (!compound) return;
    onChange(compound.name);
    setOpen(false);
  }

  return (
    <div className={cn("compound-picker flex min-w-0 flex-col", className)}>
      <FieldCaption hint={hint}>{label}</FieldCaption>
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next);
        if (next) { setQuery(""); setCenterFilter("All"); }
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`${label}: ${selected?.name ?? "choose compound"}`}
            disabled={disabled}
            className="compound-picker-trigger w-full justify-between gap-2 px-2.5"
          >
            <span className="compound-picker-value flex min-w-0 items-baseline gap-2">
              <strong className="shrink-0 font-semibold">{selected ? <Formula compound={selected}/> : "—"}</strong>
              <small className="truncate text-[13px] font-normal text-muted-foreground">
                {selected?.name ?? "Choose compound"}
              </small>
            </span>
            <ChevronsUpDown className="text-muted-foreground"/>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(420px,92vw)] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={(next) => {
              setQuery(next);
              if (next.trim()) setCenterFilter("All");
            }} placeholder="Search name, formula or alias…" aria-label="Search compound catalog"/>
            <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
              <span className="mr-1 text-[11px] text-muted-foreground">Contains</span>
              <ToggleGroup type="single" size="sm" spacing={0} value={centerFilter}
                onValueChange={(next) => next && setCenterFilter(next)} className="flex-wrap">
                {CHEMISTRY_CENTERS.map((center) =>
                  <ToggleGroupItem key={center} value={center} className="h-6 px-2 text-xs">{center}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            <CommandList className="max-h-[340px]">
              <CommandEmpty>No compounds match “{query}”.</CommandEmpty>
              <CommandGroup heading={
                `${Math.min(filtered.length, PICKER_RENDER_LIMIT)} of ${filtered.length}` +
                (distanceByName ? ` · ${Object.keys(distanceMap).length} reachable` : "")
              }>
                {visible.map((compound) => {
                  const hops = distanceByName ? distanceMap[compound.name] : null;
                  const isReachable = Number.isFinite(hops);
                  const aliases = compoundAliases(compound);
                  return (
                    <CommandItem key={compound.id} value={String(compound.id)}
                      onSelect={() => choose(compound)} className="gap-3 py-1.5"
                      data-checked={compound.name === value}>
                      <Formula compound={compound} className="w-24 shrink-0 truncate font-semibold"/>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{compound.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {compound.category}{aliases.length ? ` · also ${aliases[0]}` : ""}
                        </span>
                      </span>
                      {distanceByName && <span className={cn("text-xs tabular-nums whitespace-nowrap",
                        isReachable ? "text-muted-foreground" : "text-muted-foreground/60")}>
                        {isReachable ? `${hops} ${hops === 1 ? "step" : "steps"}` : "no path"}
                      </span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {filtered.length > PICKER_RENDER_LIMIT && <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              Showing the best {PICKER_RENDER_LIMIT} matches. Keep typing to narrow.
            </p>}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CompoundDirectory({
  compounds,
  total,
  filteredTotal,
  query,
  onQueryChange,
  category,
  categories,
  onCategoryChange,
  center,
  onCenterChange,
  relation,
  onRelationChange,
  from,
  distanceByName,
  selectedName,
  onSelect,
  hasMore,
  onLoadMore,
  theme
}) {
  return (
    <section className="compound-directory mt-10" aria-label="Compound directory">
      <SectionHeader
        title="Curated compounds"
        description={<>{total.toLocaleString()} compounds in the reaction graph. Distances are reaction steps
          from <strong className="font-medium text-foreground">{from || "the start compound"}</strong>. Select a row to make it the start.</>}
        actions={<span className="text-xs text-muted-foreground tabular-nums">
          {compounds.length.toLocaleString()} of {filteredTotal.toLocaleString()}
        </span>}
      />

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_180px]">
        <InputGroup>
          <InputGroupAddon><Search/></InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter by name, formula, alias or element" aria-label="Filter compound directory"/>
        </InputGroup>
        <NativeSelect value={relation} onChange={(event) => onRelationChange(event.target.value)}
          aria-label={`Relationship to ${from || "start"}`} className="w-full">
          <NativeSelectOption value="All">Any distance</NativeSelectOption>
          <NativeSelectOption value="Reachable">Reachable from start</NativeSelectOption>
          <NativeSelectOption value="Near3">Within 3 steps</NativeSelectOption>
          <NativeSelectOption value="Near10">Within 10 steps</NativeSelectOption>
          <NativeSelectOption value="Unreachable">No path from start</NativeSelectOption>
        </NativeSelect>
        <NativeSelect value={category} onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Filter compound directory by category" className="w-full">
          {categories.map((item) => (
            <NativeSelectOption key={item} value={item}>{item === "All" ? "All classes" : item}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <ToggleGroup type="single" size="sm" spacing={1} value={center}
        onValueChange={(next) => next && onCenterChange(next)}
        className="my-3 flex-wrap justify-start" aria-label="Contains element">
        {CHEMISTRY_CENTERS.map((item) =>
          <ToggleGroupItem key={item} value={item} className="px-2.5 text-xs">
            {item === "All" ? "Any element" : item}
          </ToggleGroupItem>)}
      </ToggleGroup>

      <div className="max-h-[600px] overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              <TableHead className="w-32">Formula</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="max-md:hidden">Class</TableHead>
              <TableHead className="max-md:hidden">Elements</TableHead>
              <TableHead className="text-right">From start</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {compounds.map((compound) => (
              <TableRow key={compound.id} tabIndex={0} role="button"
                data-state={compound.name === selectedName ? "selected" : undefined}
                onClick={() => onSelect(compound)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(compound); } }}
                className="cursor-pointer data-[state=selected]:bg-route/10 data-[state=selected]:shadow-[inset_2px_0_0_var(--route)]">
                <TableCell className="font-semibold"><Formula compound={compound}/></TableCell>
                <TableCell className="max-w-0 truncate">{compound.name}</TableCell>
                <TableCell className="max-md:hidden">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="category-dot" style={{ background: categoryColor(theme, compound.category) }}/>
                    {compound.category}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground max-md:hidden">
                  {formulaElements(compound.formula).slice(0, 6).join(" ")}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {relationshipLabel(compound, from, distanceByName)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredTotal === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>No compounds match</EmptyTitle>
              <EmptyDescription>Clear the filters or try a different formula.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      {hasMore && (
        <Button variant="outline" className="mt-3" onClick={onLoadMore}>
          Show {Math.min(DIRECTORY_PAGE_SIZE, filteredTotal - compounds.length)} more
          <span className="text-muted-foreground">{(filteredTotal - compounds.length).toLocaleString()} remaining</span>
        </Button>
      )}
    </section>
  );
}

/** A route reads like a transit line: compounds are stops, reactions are legs. */
function PathResult({ result }) {
  if (!result?.found) return null;

  return (
    <ol className="px-4 pt-4 pb-2" aria-label="Reaction pathway">
      {result.path.map((compound, index) => {
        const reaction = result.reactionPath[index];
        const first = index === 0;
        const last = index === result.path.length - 1;
        return (
          <li key={`${compound.id}-${index}`} className="relative pl-6">
            {!last && <span aria-hidden="true" className="absolute top-3 -bottom-1 left-[6px] w-0.5 bg-route"/>}
            <span aria-hidden="true" className={cn(
              "absolute top-[3px] left-0 size-3.5 rounded-full border-[3px]",
              first ? "border-route-start bg-route-start" : last ? "border-route bg-route" : "border-route bg-card"
            )}/>
            <div className="flex min-h-5 min-w-0 items-baseline gap-2">
              <Formula compound={compound} className="text-sm font-semibold"/>
              <span className="truncate text-[13px] text-muted-foreground">{compound.name}</span>
            </div>
            {!last && reaction && (
              <article className="reaction-audit-card mt-2 mb-4 rounded-lg border bg-muted/40 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-[15px] leading-snug font-semibold break-words">{reaction.reaction}</strong>
                  <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                    {reaction.reversible ? "Reversible" : "Directed"}
                  </Badge>
                </div>
                {reaction.equation && <code className="mt-2 block font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                  {reaction.equation}
                </code>}
                {reaction.conditions && <p className="mt-1.5 text-[13px] text-muted-foreground">{reaction.conditions}</p>}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground/80">
                  <span>Weight {reaction.cost ?? 1}</span>
                  {reaction.sourceKey && <span className="font-mono">{reaction.sourceKey}</span>}
                </div>
              </article>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const PATH_ALGORITHMS = [
  ["bfs", "BFS — fewest reactions"],
  ["dijkstra", "Dijkstra — lowest weight"],
  ["astar", "A* — reverse-hop heuristic"],
  ["dial", "Dial — bucket queue"],
  ["bellmanford", "Bellman-Ford — relaxation"],
  ["bidirectional", "Bidirectional BFS"],
  ["bidijkstra", "Bidirectional Dijkstra"],
  ["duan2025", "Pivot frontier (Duan et al. 2025)"]
];
const STRUCTURE_ALGORITHMS = [
  ["scc", "Tarjan — strongly connected components"],
  ["cycle", "DFS — first directed cycle"]
];

function OptionSelect({ label, value, onChange, disabled, options, className = "" }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <FieldCaption>{label}</FieldCaption>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label={label}><SelectValue/></SelectTrigger>
        <SelectContent position="popper">
          {options.map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function SimulationHud({ simulation, currentCompound, onSkip }) {
  if (!simulation.running) return null;

  const progress = simulation.total > 0
    ? Math.min(100, Math.round((simulation.step / simulation.total) * 100))
    : 0;

  return (
    <Card size="sm" role="status" className="absolute top-14 left-1/2 z-20 w-[min(380px,calc(100%-1.5rem))] -translate-x-1/2 gap-2 bg-overlay shadow-lg">
      <CardHeader>
        <CardDescription>Replaying {simulation.algorithm}</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-base">
          {currentCompound ? <Formula compound={currentCompound}/> : "—"}
          {currentCompound && <span className="truncate text-xs font-normal text-muted-foreground">{currentCompound.name}</span>}
        </CardTitle>
        <CardAction><Button size="sm" variant="outline" onClick={onSkip}>Skip</Button></CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={progress} className="h-1 [&>[data-slot=progress-indicator]]:bg-route"/>
        <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
          <span>Step <b className="font-semibold text-foreground">{simulation.step}</b> of {simulation.total}</span>
          <span>Visited <b className="font-semibold text-foreground">{simulation.visited.length}</b></span>
          <span><b className="font-semibold text-foreground">{simulation.elapsed.toFixed(1)}</b> / {((simulation.duration ?? FINAL_HOLD_MS) / 1000).toFixed(1)} s</span>
        </div>
      </CardContent>
    </Card>
  );
}


export default function App() {
  const [network, setNetwork] = useState(null);
  const [rendererMode, setRendererMode] = useState('sigma');
  const [studioView,setStudioView]=useState(()=>{
    const hash=window.location.hash;
    return hash==="#ord-database"||hash==="#data-library"?"data":
      hash==="#algorithm-lab"?"lab":"explore";
  });
  const [inspectorOpen,setInspectorOpen]=useState(()=>window.innerWidth>1100);
  const [commandOpen,setCommandOpen]=useState(false);
  const [studioTheme,setStudioTheme]=useState(()=>{
    try{return localStorage.getItem("chempath-theme")==="light"?"light":"dark";}
    catch{return "dark";}
  });
  const [neighborhood, setNeighborhood] = useState(null);
  const [neighborhoodError, setNeighborhoodError] = useState("");
  const [stats, setStats] = useState(null);
  const [from, setFrom] = useState("Methane");
  const [to, setTo] = useState("Bicarbonate");
  const [mode, setMode] = useState("path");
  const [pathAlgorithm, setPathAlgorithm] = useState("bfs");
  const [structureAlgorithm, setStructureAlgorithm] = useState("scc");
  const [result, setResult] = useState(null);
  const [selectedReaction,setSelectedReaction]=useState(null);
  const [highlight, setHighlight] = useState(EMPTY_HIGHLIGHT);
  const [status, setStatus] = useState("Connecting to C++");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [reachableTargets, setReachableTargets] = useState([]);
  const [targetDistances, setTargetDistances] = useState({});
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryCategory, setDirectoryCategory] = useState("All");
  const [directoryCenter, setDirectoryCenter] = useState("All");
  const [directoryRelation, setDirectoryRelation] = useState("All");
  const [directoryLimit, setDirectoryLimit] = useState(DIRECTORY_PAGE_SIZE);
  const [simulation, setSimulation] = useState({
    running: false,
    algorithm: "",
    step: 0,
    total: 0,
    visited: [],
    active: null,
    elapsed: 0,
    duration: FINAL_HOLD_MS
  });

  const runTokenRef = useRef(0);
  const setStudioPage=(view)=>{
    setStudioView(view);
    window.history.replaceState(null,"",window.location.pathname+window.location.search+
      (view==="explore"?"#explorer":view==="data"?"#data-library":
        view==="compare"?"#algorithm-compare":"#algorithm-lab"));
    window.scrollTo({top:0,behavior:"instant"});
  };
  useEffect(()=>{
    const onResize=()=>{
      if(window.innerWidth<=900)setInspectorOpen(false);
    };
    window.addEventListener("resize",onResize);
    return ()=>window.removeEventListener("resize",onResize);
  },[]);
  useEffect(()=>{
    try{localStorage.setItem("chempath-theme",studioTheme);}
    catch{/* ephemeral theme preference */}
    // Match the browser chrome and native form controls to the active theme.
    document.documentElement.dataset.theme=studioTheme;
    document.documentElement.classList.toggle("dark",studioTheme==="dark");
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content",studioTheme==="light"?"#fbfaf8":"#121316");
  },[studioTheme]);
  useEffect(()=>{
    const onKey=(event)=>{
      const typing=event.target?.closest?.('input,textarea,select,[contenteditable="true"]');
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();setCommandOpen(open=>!open);
      }else if(event.key==="/"&&!typing&&!event.metaKey&&!event.ctrlKey&&!event.altKey){
        event.preventDefault();setCommandOpen(true);
      }else if(event.key==="Escape"&&!typing)setCommandOpen(false);
    };
    document.addEventListener("keydown",onKey);
    return ()=>document.removeEventListener("keydown",onKey);
  },[]);

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

  const directoryCategories = useMemo(() => {
    const values = Array.from(
      new Set(compounds.map((compound) => compound.category).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));

    return ["All", ...values];
  }, [compounds]);

  const directoryDistanceMap = useMemo(
    () => ({ [from]: 0, ...targetDistances }),
    [from, targetDistances]
  );

  const directoryFiltered = useMemo(() => {
    const filtered = compounds.filter((compound) => {
      if (directoryCategory !== "All" && compound.category !== directoryCategory) {
        return false;
      }

      if (!matchesChemistryCenter(compound, directoryCenter)) {
        return false;
      }

      const hops = compound.name === from ? 0 : directoryDistanceMap[compound.name];
      if (directoryRelation === "Reachable" && !Number.isFinite(hops)) return false;
      if (directoryRelation === "Near3" && !(Number.isFinite(hops) && hops <= 3)) return false;
      if (directoryRelation === "Near10" && !(Number.isFinite(hops) && hops <= 10)) return false;
      if (directoryRelation === "Unreachable" && Number.isFinite(hops)) return false;

      return true;
    });

    const ranked = rankedCompounds(filtered, directorySearch);

    if (!directorySearch.trim() && directoryRelation !== "All") {
      ranked.sort((left, right) => {
        const leftHops = left.name === from ? 0 : directoryDistanceMap[left.name];
        const rightHops = right.name === from ? 0 : directoryDistanceMap[right.name];

        if (Number.isFinite(leftHops) && Number.isFinite(rightHops)) {
          return leftHops - rightHops || left.name.localeCompare(right.name);
        }

        if (Number.isFinite(leftHops)) return -1;
        if (Number.isFinite(rightHops)) return 1;
        return left.name.localeCompare(right.name);
      });
    }

    return ranked;
  }, [
    compounds,
    directorySearch,
    directoryCategory,
    directoryCenter,
    directoryRelation,
    directoryDistanceMap,
    from
  ]);

  const directoryCompounds = useMemo(
    () => directoryFiltered.slice(0, directoryLimit),
    [directoryFiltered, directoryLimit]
  );

  useEffect(() => {
    setDirectoryLimit(DIRECTORY_PAGE_SIZE);
  }, [directorySearch, directoryCategory, directoryCenter, directoryRelation]);

  useEffect(() => {
    if (!network || !from) {
      setReachableTargets([]);
      setTargetDistances({});
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

        const distances = Object.fromEntries(
          (data.distances ?? [])
            .filter((compound) => compound.name !== from)
            .map((compound) => [compound.name, compound.hops])
        );
        setTargetDistances(distances);

        // Keep the user's chosen target even when it is currently unreachable.
        // Reachability is information, not a reason to mutate the selection.
      })
      .catch(() => {
        if (!cancelled) {
          setReachableTargets([]);
          setTargetDistances({});
        }
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

  const selectedToId = useMemo(
    () => compounds.find((compound) => compound.name === to)?.id ?? null,
    [compounds, to]
  );

  const graphNetwork = useMemo(() => {
    if (!network) return null;
    if (network.nodes.length <= GRAPH_RENDER_LIMIT) return network;

    const priority = [];
    const prioritySeen = new Set();
    const addPriority = (id) => {
      if (!Number.isInteger(id) || prioritySeen.has(id)) return;
      prioritySeen.add(id);
      priority.push(id);
    };

    // Never allow traversal noise to push source, target, or the final path out.
    addPriority(selectedFromId);
    addPriority(selectedToId);
    result?.path?.forEach((compound) => addPriority(compound.id));
    (highlight.nodes ?? []).forEach(addPriority);
    result?.cycle?.forEach((compound) => addPriority(compound.id));
    result?.components?.[0]?.slice(0, 80).forEach((compound) => addPriority(compound.id));

    const traversalIds = result?.visitedOrder?.map((compound) => compound.id) ?? [];
    const traversalBudget = Math.max(
      0,
      Math.min(
        GRAPH_VISITED_FOCUS_LIMIT,
        GRAPH_RENDER_LIMIT - priority.length - 120
      )
    );

    if (traversalBudget > 0 && traversalIds.length > 0) {
      const stride = Math.max(1, Math.ceil(traversalIds.length / traversalBudget));
      for (
        let index = 0;
        index < traversalIds.length && priority.length < GRAPH_RENDER_LIMIT - 120;
        index += stride
      ) {
        addPriority(traversalIds[index]);
      }
      traversalIds.slice(-16).forEach(addPriority);
    }

    const degree = new Map(network.nodes.map((node) => [node.id, 0]));
    for (const edge of network.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const ranked = [...network.nodes].sort((left, right) =>
      (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
      left.name.localeCompare(right.name)
    );

    const visible = new Set(priority.slice(0, GRAPH_RENDER_LIMIT));
    for (const node of ranked) {
      if (visible.size >= GRAPH_RENDER_LIMIT) break;
      visible.add(node.id);
    }

    const nodes = network.nodes.filter((node) => visible.has(node.id));
    const edges = network.edges.filter(
      (edge) => visible.has(edge.source) && visible.has(edge.target)
    );

    return {
      ...network,
      nodes,
      edges,
      fullNodeCount: network.nodes.length,
      fullEdgeCount: network.edges.length
    };
  }, [network, selectedFromId, selectedToId, highlight.nodes, result]);

  const currentCompound = useMemo(
    () => compounds.find((compound) => compound.id === simulation.active) ?? null,
    [compounds, simulation.active]
  );

  const algorithmDescription = useMemo(() => {
    if (mode === "dfs") {
      return "Depth-first search with an explicit stack visits every compound reachable from the start.";
    }

    if (mode === "structure") {
      return structureAlgorithm === "scc"
        ? "Tarjan's algorithm groups compounds that can all reach each other, using low-link values and a stack."
        : "Depth-first search with three-colour marking reports the first directed cycle it finds.";
    }

    const descriptions = {
      bfs: "Breadth-first search with a queue finds the route with the fewest reactions.",
      dijkstra: "Dijkstra with a binary heap finds the route with the lowest total graph weight.",
      astar: "A* adds an admissible reverse-hop heuristic to Dijkstra's priority queue.",
      dial: "Dial's algorithm uses integer-weight buckets instead of a heap.",
      bellmanford: "Bellman-Ford relaxes every edge repeatedly; O(VE) baseline.",
      bidirectional: "Bidirectional BFS searches from both ends and meets in the middle.",
      bidijkstra: "Bidirectional Dijkstra runs two weighted searches that meet in the middle.",
      duan2025: "Pivot/frontier hybrid inspired by Duan et al., STOC 2025. Output is exact."
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

    const traversalDuration = Math.min(
      MAX_SIMULATION_MS - FINAL_HOLD_MS,
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
    // Render computed paths immediately. Replay is a deliberate second action.
    cancelReplay();
    setBusy(true);
    setMode("path");
    setResult(null);
    try{
      const data=await api.path(from,to,pathAlgorithm);
      setResult(data);
      setSelectedReaction(null);
      setHighlight(buildPathHighlight(data));
      setInspectorOpen(true);
    }catch(error){
      setResult({error:error.message});
      setHighlight(EMPTY_HIGHLIGHT);
      setInspectorOpen(true);
    }finally{setBusy(false);}
  }
  async function replayCurrentPath() {
    if(!result?.found||simulation.running)return;
    await replay(result.visitedOrder,result.algorithm,buildPathHighlight(result));
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
      duration: FINAL_HOLD_MS
    });
  }

  function setModeClean(nextMode) {
    reset();
    setMode(nextMode);
  }

  const selectedCompound=compounds.find(compound=>compound.name===from)??null;
  const expandNeighborhood=(name)=>{
    setNeighborhoodError("");
    api.neighborhood(name,2,350).then(setNeighborhood)
      .catch(error=>setNeighborhoodError(error.message));
  };
  const outputTitle = mode === "path" ? "Route" : mode === "dfs" ? "Reachable compounds" :
    structureAlgorithm === "scc" ? "Strongly connected components" : "Cycle check";
  const boardRows = stats ? [
    { label: "COMPOUNDS", value: stats.compounds?.toLocaleString() ?? "-" },
    { label: "REACTIONS", value: stats.reactions?.toLocaleString() ?? "-" },
    { label: "EDGES", value: stats.directedEdges?.toLocaleString() ?? "-" },
    { label: "STORAGE", value: String(stats.backend ?? "-").toUpperCase() }
  ] : [];
  return (
    <ThemeContext.Provider value={studioTheme}>
    <TooltipProvider delayDuration={300}>
    <main className="studio-app flex min-h-dvh flex-col bg-background text-foreground" data-theme={studioTheme}>
      <StudioTopbar
        view={studioView} onChange={setStudioPage} status={status}
        onSearch={()=>setCommandOpen(true)}
        onToggleInspector={()=>setInspectorOpen(value=>!value)}
        onToggleTheme={()=>setStudioTheme(value=>value==="dark"?"light":"dark")}
        theme={studioTheme} inspectorOpen={inspectorOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
      {studioView==="explore"&&(
      <section id="explorer" className={cn("explorer studio-explore flex flex-col",
        "md:h-[calc(100dvh-3.25rem)] md:min-h-[520px]", !inspectorOpen && "inspector-collapsed")}>
        <div className="relative z-20 flex shrink-0 flex-wrap items-end gap-3 border-b bg-card px-4 py-2.5 md:flex-nowrap">
          <Tabs value={mode} onValueChange={setModeClean} className="max-md:w-full">
            <TabsList aria-label="Algorithm mode" className="max-md:w-full">
              <TabsTrigger value="path" disabled={simulation.running}>Pathfinding</TabsTrigger>
              <TabsTrigger value="dfs" disabled={simulation.running}>Reachability</TabsTrigger>
              <TabsTrigger value="structure" disabled={simulation.running}>Structure</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 md:flex-nowrap">
            {mode === "path" && (
              <>
                <OptionSelect label="Algorithm" value={pathAlgorithm} onChange={setPathAlgorithm}
                  disabled={busy} options={PATH_ALGORITHMS} className="w-full md:w-56 md:shrink-0"/>
                <CompoundSelect label="From" value={from} onChange={setFrom}
                  compounds={compounds} disabled={busy} className="flex-1 basis-40 md:max-w-72"/>
                <Hint label="Swap start and target">
                  <Button variant="outline" size="icon" aria-label="Swap start and target"
                    disabled={busy||simulation.running} className="max-sm:hidden"
                    onClick={()=>{setFrom(to);setTo(from);reset();}}>
                    <ArrowLeftRight/>
                  </Button>
                </Hint>
                <CompoundSelect label="To"
                  hint={targetsLoading ? "checking…" : `${reachableTargets.length} reachable`}
                  value={to} onChange={setTo} compounds={compounds}
                  distanceByName={targetDistances} disabled={busy || targetsLoading}
                  className="flex-1 basis-40 md:max-w-72"/>
                <Button className="run-button max-md:flex-1" disabled={busy || !network || targetsLoading || !to}
                  onClick={runPath}>
                  {busy ? <Spinner data-icon="inline-start"/> : <Route data-icon="inline-start"/>}
                  {busy ? "Searching…" : "Find pathway"}
                </Button>
              </>
            )}

            {mode === "dfs" && (
              <>
                <CompoundSelect label="From" value={from} onChange={setFrom}
                  compounds={compounds} disabled={busy} className="flex-1 basis-48 md:max-w-80"/>
                <Button disabled={busy || !network} onClick={runDfs}>
                  {simulation.running ? "Replaying…" : "Run DFS"}
                </Button>
              </>
            )}

            {mode === "structure" && (
              <>
                <OptionSelect label="Analysis" value={structureAlgorithm} onChange={setStructureAlgorithm}
                  disabled={busy} options={STRUCTURE_ALGORITHMS} className="w-full md:w-72"/>
                <Button disabled={busy || !network} onClick={runStructure}>
                  {simulation.running ? "Replaying…" : "Analyze graph"}
                </Button>
              </>
            )}
          </div>

          <div className="relative w-44 shrink-0 max-xl:hidden">
            <FieldCaption>Trie lookup</FieldCaption>
            <InputGroup>
              <InputGroupAddon><Search/></InputGroupAddon>
              <InputGroupInput value={search} disabled={simulation.running}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Prefix, e.g. meth" aria-label="Search compounds using Trie"/>
            </InputGroup>
            {matches.length > 0 && (
              <div className="absolute top-full right-0 z-50 mt-1.5 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                {matches.map((compound) => (
                  <button type="button" key={compound.id}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => { setFrom(compound.name); setSearch(compound.name); setMatches([]); }}>
                    <Formula compound={compound} className="font-semibold"/>
                    <span className="truncate text-xs text-muted-foreground">{compound.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={reset} className="text-muted-foreground max-md:hidden">Reset</Button>
        </div>

        <div className={cn("studio-graph-grid relative flex min-h-0 flex-1 max-md:flex-col md:grid md:grid-cols-1",
          inspectorOpen && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="graph-frame relative min-h-0 min-w-0 overflow-hidden bg-canvas max-md:h-[62dvh] max-md:min-h-[380px] [&>.network-canvas]:absolute [&>.network-canvas]:inset-0 [&>.sigma-shell]:absolute [&>.sigma-shell]:inset-0">
          <SimulationHud simulation={simulation} currentCompound={currentCompound} onSkip={cancelReplay}/>

          {graphNetwork ? (
            <>
              <MapPanel className="renderer-switch top-3 left-3 gap-0.5">
                <ButtonGroup aria-label="Graph renderer">
                  <Hint label="WebGL map of the network">
                    <Button size="sm" variant={rendererMode === "sigma" ? "secondary" : "ghost"}
                      aria-pressed={rendererMode === "sigma"} onClick={() => setRendererMode("sigma")}>Map</Button>
                  </Hint>
                  <Hint label="Clustered or layered diagram">
                    <Button size="sm" variant={rendererMode === "cytoscape" ? "secondary" : "ghost"}
                      aria-pressed={rendererMode === "cytoscape"} onClick={() => setRendererMode("cytoscape")}>Diagram</Button>
                  </Hint>
                </ButtonGroup>
                {neighborhood && <Button size="sm" variant="ghost" onClick={() => setNeighborhood(null)}>Full graph</Button>}
              </MapPanel>
              {neighborhoodError && <div role="alert" className="absolute top-14 left-3 z-10 max-w-80 rounded-lg border border-destructive/50 bg-card px-3 py-2 text-xs text-destructive">
                {neighborhoodError}
              </div>}
              {rendererMode === "sigma" ? (
                <SigmaNetwork
                  network={neighborhood || graphNetwork}
                  highlightedNodeIds={highlight.nodes}
                  highlightedEdgeIds={highlight.edges}
                  selectedNodeId={selectedFromId}
                  visitedNodeIds={simulation.visited}
                  activeNodeId={simulation.active}
                  simulationRunning={simulation.running}
                  showPopovers={false}
                  onSelectEdge={reaction=>{
                    setSelectedReaction(reaction);
                    setInspectorOpen(true);
                  }}
                  onSelectCompound={(name,id,shift) => {
                    if(shift)setTo(name);else setFrom(name);
                    setResult(null);
                    setSelectedReaction(null);
                    setInspectorOpen(true);
                  }}
                  onExpandNode={(id, name) => expandNeighborhood(name)}
                />
              ) : (
                <NetworkGraph
                  network={graphNetwork}
                  highlightedNodeIds={highlight.nodes}
                  highlightedEdgeIds={highlight.edges}
                  selectedNodeId={selectedFromId}
                  visitedNodeIds={simulation.visited}
                  activeNodeId={simulation.active}
                  simulationRunning={simulation.running}
                />
              )}
            </>
          ) : (
            <div className="graph-loading absolute inset-0 grid place-items-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia><Spinner className="size-5"/></EmptyMedia>
                  <EmptyTitle>Loading the reaction network</EmptyTitle>
                  <EmptyDescription>Waiting for the C++ engine to answer.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}

          <MapPanel aria-label="Compound classes" className="pointer-events-none right-3 bottom-3 gap-3 px-2.5 py-1.5 text-[11.5px] text-muted-foreground max-lg:hidden">
            {["Organic","Biochemical","Acid","Base","Ion","Salt","Inorganic"].map(category=>
              <span key={category} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="category-dot size-1.5" style={{background:categoryColor(studioTheme,category)}}/>{category}
              </span>)}
          </MapPanel>
        </div>

        <aside className={cn("result-dock flex min-h-0 min-w-0 flex-col overflow-y-auto border-l bg-card *:shrink-0",
          "max-md:border-t max-md:border-l-0",
          "md:max-lg:absolute md:max-lg:inset-y-0 md:max-lg:right-0 md:max-lg:z-30 md:max-lg:w-[min(360px,92%)] md:max-lg:shadow-2xl",
          !inspectorOpen && "hidden")}
          aria-label="Compound and pathway inspector">
          <StudioInspectorHeading
            compound={selectedCompound} reaction={selectedReaction} result={result}
            busy={busy} running={simulation.running} theme={studioTheme}
            onClose={()=>setInspectorOpen(false)}
            onReplay={replayCurrentPath}
            onExplore={()=>setStudioPage("data")}
            onExpand={selectedCompound?()=>expandNeighborhood(selectedCompound.name):null}
          />
          <div className="px-4 pt-4">
            <h2 className="text-[13px] font-semibold">{outputTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{algorithmDescription}</p>
          </div>

          {!result && !simulation.running && (
            <p className="px-4 pt-3 pb-4 text-[13px] leading-relaxed text-muted-foreground">
              {mode === "path"
                ? <>Choose two compounds and press <b className="font-medium text-foreground">Find pathway</b>. Shift-click a compound on the map to set the target.</>
                : <>Run the analysis to see results here.</>}
            </p>
          )}

          {result?.error && <div role="alert" className="mx-4 mt-3 rounded-lg border border-destructive/50 px-3 py-2 text-[13px] text-destructive">{result.error}</div>}

          {simulation.running && (
            <div className="px-4 pt-3">
              <p className="text-[13px] font-medium">Replaying step {simulation.step} of {simulation.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">C++ already finished the search. The replay slows it down so you can follow each expansion.</p>
            </div>
          )}

          {mode === "path" && result && !result.error && !simulation.running && (
            <>
              <StatStrip className="run-meta mx-4 mt-3">
                <Stat label="Reactions" value={result.steps ?? 0}/>
                <Stat label="Weight" value={result.totalCost ?? 0}/>
                <Stat label="Visited" value={result.visitedCount ?? 0}/>
                <Stat label="C++ time" {...engineTime(result.elapsedMs)}/>
              </StatStrip>
              {result.found ? <PathResult result={result}/> : (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle>No directed pathway</EmptyTitle>
                    <EmptyDescription>No sequence of participation edges connects these compounds.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </>
          )}

          {mode === "dfs" && result?.reachable && !simulation.running && (
            <>
              <StatStrip className="run-meta mx-4 mt-3">
                <Stat label="Reachable" value={result.count ?? 0}/>
                <Stat label="C++ time" {...engineTime(result.elapsedMs)}/>
              </StatStrip>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3">
                {result.reachable.slice(0, 80).map((compound) => (
                  <li key={compound.id} className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                    <Formula compound={compound} className="font-semibold"/>
                    <span className="truncate text-xs text-muted-foreground">{compound.name}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {mode === "structure" && structureAlgorithm === "cycle" && result?.cycle && !simulation.running && (
            <>
              <StatStrip className="run-meta mx-4 mt-3">
                <Stat label="Directed cycle" value={result.hasCycle ? "Yes" : "No"}/>
              </StatStrip>
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {result.cycle.length > 0
                  ? result.cycle.map((compound, index) => (
                      <Badge key={`${compound.id}-${index}`} variant="outline" className="gap-1.5 font-normal">
                        <Formula compound={compound} className="font-semibold"/>
                        <span className="text-muted-foreground">{compound.name}</span>
                      </Badge>
                    ))
                  : <p className="text-[13px] text-muted-foreground">No directed cycle found.</p>}
              </div>
            </>
          )}

          {mode === "structure" && structureAlgorithm === "scc" && result?.components && !simulation.running && (
            <>
              <StatStrip className="run-meta mx-4 mt-3">
                <Stat label="Components" value={result.componentCount}/>
                <Stat label="Largest" value={result.largestComponentSize}/>
                <Stat label="C++ time" {...engineTime(result.elapsedMs)}/>
              </StatStrip>
              <p className="px-4 pt-3 text-xs font-medium text-muted-foreground">Members of the largest component</p>
              <ol className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-2">
                {(result.components[0] ?? []).slice(0, 50).map((compound) => (
                  <li key={compound.id} className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                    <Formula compound={compound} className="font-semibold"/>
                    <span className="truncate text-xs text-muted-foreground">{compound.name}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <p className="mt-auto border-t px-4 py-3.5 text-xs leading-relaxed text-muted-foreground">
            Edges join compounds that take part in the same documented reaction. A route is a graph path
            for teaching, <AnnotatedText variant="underline" color="text-route">not a verified synthesis</AnnotatedText>,
            and weights are illustrative.
          </p>
        </aside>
        </div>
      </section>
      )}

      {(studioView==="lab"||studioView==="compare")&&(
        <section className="studio-view mx-auto w-full max-w-6xl px-4 pt-7 pb-16 sm:px-6" id="algorithm-lab-workspace">
          <PageHeader title={studioView==="compare"?"Compare algorithms":"Algorithm laboratory"}>
            {studioView==="compare"
              ? <>Run every shortest-path method, alternative routes, constraints and Pareto fronts
                  on <b className="font-medium text-foreground">{from}</b> → <b className="font-medium text-foreground">{to}</b>.
                  BFS minimises hops; weighted methods minimise <AnnotatedText variant="underline" color="text-route">illustrative</AnnotatedText> weights.</>
              : <>Step through traces of the C++ data structures
                  for <b className="font-medium text-foreground">{from}</b> → <b className="font-medium text-foreground">{to}</b>, and run experiments.</>}
          </PageHeader>
          <LabPanel network={network} from={from} to={to} viewMode={studioView}/>
        </section>
      )}

      {studioView==="data"&&(
        <section className="studio-view mx-auto w-full max-w-6xl px-4 pt-7 pb-16 sm:px-6" id="data-library">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1 basis-72">
              <PageHeader title="Data">
                The curated reaction graph used by every algorithm, plus optional structure and reaction
                datasets you can install locally.
              </PageHeader>
            </div>
            {boardRows.length > 0 && <SplitFlapDisplay rows={boardRows} columns={17} size="sm"
              accentColor="#f59e3b" staggerDelay={18} flipSpeed={28}
              className="max-md:hidden"/>}
          </div>
          <StatStrip className="md:hidden">
            <Stat label="Compounds" value={stats?.compounds?.toLocaleString()}/>
            <Stat label="Reactions" value={stats?.reactions?.toLocaleString()}/>
            <Stat label="Edges" value={stats?.directedEdges?.toLocaleString()}/>
          </StatStrip>
          <CompoundDirectory
            compounds={directoryCompounds}
            total={compounds.length}
            filteredTotal={directoryFiltered.length}
            query={directorySearch}
            onQueryChange={setDirectorySearch}
            category={directoryCategory}
            categories={directoryCategories}
            onCategoryChange={setDirectoryCategory}
            center={directoryCenter}
            onCenterChange={setDirectoryCenter}
            relation={directoryRelation}
            onRelationChange={setDirectoryRelation}
            from={from}
            distanceByName={directoryDistanceMap}
            selectedName={from}
            theme={studioTheme}
            onSelect={(compound) => {
              setFrom(compound.name);
              setSearch(compound.name);
              setMatches([]);
            }}
            hasMore={directoryCompounds.length < directoryFiltered.length}
            onLoadMore={() =>
              setDirectoryLimit((current) =>
                Math.min(directoryFiltered.length, current + DIRECTORY_PAGE_SIZE)
              )
            }
          />
          <PubChemCatalog/>
          <OrdExplorer/>
        </section>
      )}
      </div>
      <StudioCommandPalette
        open={commandOpen} onClose={()=>setCommandOpen(false)}
        onNavigate={setStudioPage} compounds={compounds} theme={studioTheme}
        onSelectSource={name=>{setFrom(name);setStudioPage("explore");reset();}}
        onSelectTarget={name=>{setTo(name);setStudioPage("explore");reset();}}
        onFind={()=>{setStudioPage("explore");runPath();}}
      />
    </main>
    </TooltipProvider>
    </ThemeContext.Provider>
  );
}
