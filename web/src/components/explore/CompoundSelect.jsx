import { useEffect, useMemo, useState } from "react";
import Formula from "@/components/Formula.jsx";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FieldCaption } from "./fields.jsx";
import { CHEMISTRY_CENTERS, matchesChemistryCenter } from "@/lib/chemistry.js";
import { compoundAliases, compoundSearchScore, rankedCompounds } from "@/lib/compoundSearch.js";

const PICKER_RENDER_LIMIT = 220;

/** Searchable compound combobox: shadcn Popover + Command with ChemPath ranking. */
export default function CompoundSelect({
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
    () => compounds.find(compound => compound.name === value) ?? null,
    [compounds, value]
  );

  const filtered = useMemo(() => {
    const centered = compounds.filter(compound => matchesChemistryCenter(compound, centerFilter));
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
      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (next) {
            setQuery("");
            setCenterFilter("All");
          }
        }}
      >
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
              <strong className="shrink-0 font-semibold">
                {selected ? <Formula compound={selected} /> : "—"}
              </strong>
              <small className="truncate text-[13px] font-normal text-muted-foreground">
                {selected?.name ?? "Choose compound"}
              </small>
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(420px,92vw)] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={next => {
                setQuery(next);
                if (next.trim()) setCenterFilter("All");
              }}
              placeholder="Search name, formula or alias…"
              aria-label="Search compound catalog"
            />
            <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
              <span className="mr-1 text-[11px] text-muted-foreground">Contains</span>
              <ToggleGroup
                type="single"
                size="sm"
                spacing={0}
                value={centerFilter}
                onValueChange={next => next && setCenterFilter(next)}
                className="flex-wrap"
              >
                {CHEMISTRY_CENTERS.map(center => (
                  <ToggleGroupItem key={center} value={center} className="h-6 px-2 text-xs">
                    {center}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <CommandList className="max-h-[340px]">
              <CommandEmpty>No compounds match “{query}”.</CommandEmpty>
              <CommandGroup
                heading={
                  `${Math.min(filtered.length, PICKER_RENDER_LIMIT)} of ${filtered.length}` +
                  (distanceByName ? ` · ${Object.keys(distanceMap).length} reachable` : "")
                }
              >
                {visible.map(compound => {
                  const hops = distanceByName ? distanceMap[compound.name] : null;
                  const isReachable = Number.isFinite(hops);
                  const aliases = compoundAliases(compound);
                  return (
                    <CommandItem
                      key={compound.id}
                      value={String(compound.id)}
                      onSelect={() => choose(compound)}
                      className="gap-3 py-1.5"
                      data-checked={compound.name === value}
                    >
                      <Formula
                        compound={compound}
                        className="w-24 shrink-0 truncate font-semibold"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{compound.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {compound.category}
                          {aliases.length ? ` · also ${aliases[0]}` : ""}
                        </span>
                      </span>
                      {distanceByName && (
                        <span
                          className={cn(
                            "text-xs tabular-nums whitespace-nowrap",
                            isReachable ? "text-muted-foreground" : "text-muted-foreground/60"
                          )}
                        >
                          {isReachable ? `${hops} ${hops === 1 ? "step" : "steps"}` : "no path"}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {filtered.length > PICKER_RENDER_LIMIT && (
              <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                Showing the best {PICKER_RENDER_LIMIT} matches. Keep typing to narrow.
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
