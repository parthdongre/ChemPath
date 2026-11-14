import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, Database, FlaskConical, GitCompareArrows,
  Moon, Network, PanelRight, Play, Search, Sun, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut
} from "@/components/ui/command";
import Formula from "./Formula.jsx";
import { CategoryBadge, Hint } from "./studio/primitives.jsx";
import { categoryColor } from "../theme.js";

export const STUDIO_VIEWS = [
  { id: "explore", label: "Explore", icon: Network, description: "Reaction network and pathfinding" },
  { id: "compare", label: "Compare", icon: GitCompareArrows, description: "Algorithms and route alternatives" },
  { id: "lab", label: "Laboratory", icon: FlaskConical, description: "Step-by-step data structures" },
  { id: "data", label: "Data", icon: Database, description: "Compounds and source datasets" }
];

/** Hexagonal ring with a highlighted route across it. */
function BrandMark() {
  return <svg className="shrink-0 text-foreground" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M12 2.6 20.2 7.3v9.4L12 21.4 3.8 16.7V7.3Z" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity=".5"/>
    <path d="M3.8 7.3 12 12l8.2 4.7" fill="none" stroke="var(--route)" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="3.8" cy="7.3" r="2.2" fill="var(--card)" stroke="currentColor" strokeWidth="1.6"/>
    <circle cx="20.2" cy="16.7" r="2.2" fill="var(--route)"/>
  </svg>;
}

export function StudioTopbar({
  view, onChange, status, onSearch, onToggleInspector, onToggleTheme, theme, inspectorOpen
}) {
  const online = status?.includes("online");
  return <header className="sticky top-0 z-40 flex h-13 shrink-0 items-center gap-5 border-b bg-card px-3 sm:px-4">
    <div className="flex items-center gap-2.5">
      <BrandMark/>
      <span className="text-sm font-semibold tracking-tight max-md:hidden">ChemPath</span>
    </div>
    <nav className="flex min-w-0 items-center gap-0.5" aria-label="Primary">
      {STUDIO_VIEWS.map(({ id, label, icon: Icon, description }) =>
        <Hint key={id} label={description}>
          <Button variant={view === id ? "secondary" : "ghost"} size="sm"
            className={cn("text-muted-foreground", view === id && "text-foreground [&_svg]:text-route")}
            onClick={() => onChange(id)} aria-current={view === id ? "page" : undefined}
            data-studio-view={id}>
            <Icon data-icon="inline-start"/>
            <span className="max-md:sr-only">{label}</span>
          </Button>
        </Hint>)}
    </nav>
    <div className="ml-auto flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onSearch} aria-label="Search commands and compounds"
        className="w-56 justify-start text-muted-foreground max-lg:w-auto">
        <Search data-icon="inline-start"/>
        <span className="flex-1 text-left max-lg:sr-only">Search compounds</span>
        <Kbd className="max-lg:hidden">⌘K</Kbd>
      </Button>
      <Hint label={status}>
        <span className="flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground" tabIndex={0}>
          <span className={cn("size-1.5 rounded-full", online ? "bg-success" : "bg-destructive")}/>
          <span className="max-md:sr-only">{online ? "C++ engine" : "Engine offline"}</span>
        </span>
      </Hint>
      <Separator orientation="vertical" className="mx-1 h-5 self-center max-sm:hidden"/>
      <Hint label={theme === "dark" ? "Light appearance" : "Dark appearance"}>
        <Button variant="ghost" size="icon" onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Use light appearance" : "Use dark appearance"}>
          {theme === "dark" ? <Sun/> : <Moon/>}
        </Button>
      </Hint>
      {view === "explore" && <Hint label={inspectorOpen ? "Hide inspector" : "Show inspector"}>
        <Button variant={inspectorOpen ? "secondary" : "ghost"} size="icon" onClick={onToggleInspector}
          aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"} aria-pressed={inspectorOpen}>
          <PanelRight/>
        </Button>
      </Hint>}
    </div>
  </header>;
}

const commands = [
  { id: "explore", title: "Explore reaction network", icon: Network },
  { id: "compare", title: "Compare graph algorithms", icon: GitCompareArrows },
  { id: "lab", title: "Open algorithm laboratory", icon: FlaskConical },
  { id: "data", title: "Browse compound data", icon: Database },
  { id: "find", title: "Find pathway for current query", icon: ArrowRight }
];

export function StudioCommandPalette({
  open, onClose, onNavigate, compounds, onSelectSource, onSelectTarget, onFind, theme = "dark"
}) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) setQuery(""); }, [open]);
  const q = query.trim().toLowerCase();
  // Pre-filter so the dialog never mounts hundreds of rows for one keystroke.
  const matches = useMemo(() => q.length < 2 ? [] : compounds.filter(item =>
    `${item.name} ${item.formula} ${item.category}`.toLowerCase().includes(q)).slice(0, 12), [compounds, q]);
  const perform = (callback) => { callback(); onClose(); };
  return <CommandDialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}
    title="Command palette" description="Search compounds or run a command" className="sm:max-w-xl">
    <Command>
    <CommandInput value={query} onValueChange={setQuery}
      placeholder="Type a compound, formula or command…" aria-label="Search commands and compounds"/>
    <CommandList className="max-h-[min(420px,60vh)]">
      <CommandEmpty>No matching compounds or commands.</CommandEmpty>
      {matches.length > 0 && <CommandGroup heading="Compounds">
        {matches.map(item =>
          <CommandItem key={item.id} value={`${item.name} ${item.formula} ${item.category}`}
            className="[&>svg:last-child]:hidden"
            onSelect={() => perform(() => onSelectSource(item.name))}>
            <span className="category-dot" style={{ background: categoryColor(theme, item.category) }}/>
            <Formula compound={item} className="font-semibold"/>
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className="ml-auto flex gap-1">
              <Button size="xs" variant="outline" onClick={(event) => {
                event.stopPropagation(); perform(() => onSelectSource(item.name));
              }}>From</Button>
              <Button size="xs" variant="outline" onClick={(event) => {
                event.stopPropagation(); perform(() => onSelectTarget(item.name));
              }}>To</Button>
            </span>
          </CommandItem>)}
      </CommandGroup>}
      <CommandGroup heading="Commands">
        {commands.map(({ id, title, icon: Icon }) =>
          <CommandItem key={id} value={title}
            onSelect={() => perform(() => id === "find" ? onFind() : onNavigate(id))}>
            <Icon/><span>{title}</span>
            <CommandShortcut>{id === "find" ? "Run" : "Go to"}</CommandShortcut>
          </CommandItem>)}
      </CommandGroup>
    </CommandList>
    </Command>
  </CommandDialog>;
}

export function StudioInspectorHeading({
  compound, reaction, result, busy, running, onClose, onReplay, onExplore, onExpand, theme = "dark"
}) {
  return <div className="border-b px-4 pt-2.5 pb-4">
    <div className="-mr-2 flex items-center justify-between">
      <span className="text-xs font-medium text-muted-foreground">Selected compound</span>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close inspector"><X/></Button>
    </div>
    {compound ? <div className="mt-0.5 flex flex-col items-start">
      <Formula compound={compound} className="max-w-full truncate text-[26px] leading-tight font-semibold tracking-tight"/>
      <strong className="mt-0.5 text-sm font-medium break-words">{compound.name}</strong>
      <CategoryBadge category={compound.category} theme={theme} className="mt-2"/>
    </div> : <p className="mt-1 text-[13px] text-muted-foreground">Click a compound on the map to inspect it.</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">
      {compound && onExpand && <Hint label="Compounds within two reactions">
        <Button variant="outline" size="sm" onClick={onExpand}><Network data-icon="inline-start"/>Neighborhood</Button>
      </Hint>}
      <Button variant="outline" size="sm" onClick={onExplore}><BookOpen data-icon="inline-start"/>Directory</Button>
      {result?.found && !running && <Hint label="Replay the traversal order returned by C++">
        <Button variant="outline" size="sm" onClick={onReplay} disabled={busy}><Play data-icon="inline-start"/>Replay</Button>
      </Hint>}
    </div>
    {reaction && <div className="mt-4 space-y-1 rounded-lg border bg-muted/50 p-3">
      <span className="text-xs font-medium text-muted-foreground">Selected reaction</span>
      <p className="text-[13px] font-medium break-words">{reaction.reaction || "Reaction participation"}</p>
      {reaction.equation && <code className="block font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">{reaction.equation}</code>}
      {reaction.conditions && <p className="text-xs text-muted-foreground">{reaction.conditions}</p>}
      {reaction.cost != null && <p className="text-xs text-muted-foreground">Graph weight {reaction.cost}</p>}
    </div>}
  </div>;
}
