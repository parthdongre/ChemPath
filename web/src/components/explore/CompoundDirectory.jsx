import Formula from "@/components/Formula.jsx";
import { categoryColor } from "@/theme.js";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SectionHeader } from "@/components/studio/primitives.jsx";
import { CHEMISTRY_CENTERS, formulaElements, relationshipLabel } from "@/lib/chemistry.js";
import { DIRECTORY_PAGE_SIZE } from "@/lib/constants.js";

export default function CompoundDirectory({
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
        description={
          <>
            {total.toLocaleString()} compounds in the reaction graph. Distances are reaction steps
            from{" "}
            <strong className="font-medium text-foreground">{from || "the start compound"}</strong>.
            Select a row to make it the start.
          </>
        }
        actions={
          <span className="text-xs text-muted-foreground tabular-nums">
            {compounds.length.toLocaleString()} of {filteredTotal.toLocaleString()}
          </span>
        }
      />

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_180px]">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Filter by name, formula, alias or element"
            aria-label="Filter compound directory"
          />
        </InputGroup>
        <NativeSelect
          value={relation}
          onChange={event => onRelationChange(event.target.value)}
          aria-label={`Relationship to ${from || "start"}`}
          className="w-full"
        >
          <NativeSelectOption value="All">Any distance</NativeSelectOption>
          <NativeSelectOption value="Reachable">Reachable from start</NativeSelectOption>
          <NativeSelectOption value="Near3">Within 3 steps</NativeSelectOption>
          <NativeSelectOption value="Near10">Within 10 steps</NativeSelectOption>
          <NativeSelectOption value="Unreachable">No path from start</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          value={category}
          onChange={event => onCategoryChange(event.target.value)}
          aria-label="Filter compound directory by category"
          className="w-full"
        >
          {categories.map(item => (
            <NativeSelectOption key={item} value={item}>
              {item === "All" ? "All classes" : item}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        value={center}
        onValueChange={next => next && onCenterChange(next)}
        className="my-3 flex-wrap justify-start"
        aria-label="Contains element"
      >
        {CHEMISTRY_CENTERS.map(item => (
          <ToggleGroupItem key={item} value={item} className="px-2.5 text-xs">
            {item === "All" ? "Any element" : item}
          </ToggleGroupItem>
        ))}
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
            {compounds.map(compound => (
              <TableRow
                key={compound.id}
                tabIndex={0}
                role="button"
                data-state={compound.name === selectedName ? "selected" : undefined}
                onClick={() => onSelect(compound)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(compound);
                  }
                }}
                className="cursor-pointer data-[state=selected]:bg-route/10 data-[state=selected]:shadow-[inset_2px_0_0_var(--route)]"
              >
                <TableCell className="font-semibold">
                  <Formula compound={compound} />
                </TableCell>
                <TableCell className="max-w-0 truncate">{compound.name}</TableCell>
                <TableCell className="max-md:hidden">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="category-dot"
                      style={{ background: categoryColor(theme, compound.category) }}
                    />
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
          <span className="text-muted-foreground">
            {(filteredTotal - compounds.length).toLocaleString()} remaining
          </span>
        </Button>
      )}
    </section>
  );
}
