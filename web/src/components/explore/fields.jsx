import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export function FieldCaption({ children, hint }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
      {children}
      {hint && <span className="font-normal tabular-nums opacity-80">{hint}</span>}
    </span>
  );
}

export const PATH_ALGORITHMS = [
  ["bfs", "BFS — fewest reactions"],
  ["dijkstra", "Dijkstra — lowest weight"],
  ["astar", "A* — reverse-hop heuristic"],
  ["dial", "Dial — bucket queue"],
  ["bellmanford", "Bellman-Ford — relaxation"],
  ["bidirectional", "Bidirectional BFS"],
  ["bidijkstra", "Bidirectional Dijkstra"],
  ["duan2025", "Pivot frontier (Duan et al. 2025)"]
];
export const STRUCTURE_ALGORITHMS = [
  ["scc", "Tarjan — strongly connected components"],
  ["cycle", "DFS — first directed cycle"]
];

export function OptionSelect({ label, value, onChange, disabled, options, className = "" }) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <FieldCaption>{label}</FieldCaption>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
