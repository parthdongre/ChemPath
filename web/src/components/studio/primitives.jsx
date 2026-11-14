import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { categoryColor } from "@/theme.js";

/** Tooltip around any focusable control. */
export function Hint({ label, side = "bottom", children }) {
  if (!label) return children;
  return <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>;
}

/** Opaque floating surface for controls drawn over the graph canvas. */
export function MapPanel({ className, ...props }) {
  return <div className={cn(
    "absolute z-10 flex items-center rounded-lg border bg-overlay p-0.5 shadow-sm", className
  )} {...props}/>;
}

/** Label / value pair used in stat strips. */
export function Stat({ label, value, unit, className }) {
  return <div className={cn("min-w-0 px-3 py-2", className)}>
    <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 truncate text-base font-semibold tabular-nums">
      {value ?? "—"}{unit && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{unit}</span>}
    </dd>
  </div>;
}

export function StatStrip({ className, children }) {
  return <dl className={cn(
    "grid auto-cols-fr grid-flow-col divide-x overflow-hidden rounded-lg border bg-card", className
  )}>{children}</dl>;
}

/** Heading row for a page section with optional trailing actions. */
export function SectionHeader({ title, description, actions, className }) {
  return <header className={cn("mb-3 flex items-start justify-between gap-4", className)}>
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 max-w-[76ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </header>;
}

export function PageHeader({ title, children }) {
  return <header className="mb-6">
    <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    {children && <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">{children}</p>}
  </header>;
}

/** Compound class shown as a coloured dot plus label. */
export function CategoryBadge({ category, theme, className }) {
  return <Badge variant="outline" className={cn("gap-1.5 font-normal text-muted-foreground", className)}>
    <span className="category-dot" style={{ background: categoryColor(theme, category) }}/>
    {category || "Compound"}
  </Badge>;
}
