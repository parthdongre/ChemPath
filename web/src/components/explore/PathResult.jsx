import Formula from "@/components/Formula.jsx";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** A route reads like a transit line: compounds are stops, reactions are legs. */
export default function PathResult({ result }) {
  if (!result?.found) return null;

  return (
    <ol className="px-4 pt-4 pb-2" aria-label="Reaction pathway">
      {result.path.map((compound, index) => {
        const reaction = result.reactionPath[index];
        const first = index === 0;
        const last = index === result.path.length - 1;
        return (
          <li key={`${compound.id}-${index}`} className="relative pl-6">
            {!last && (
              <span
                aria-hidden="true"
                className="absolute top-3 -bottom-1 left-[6px] w-0.5 bg-route"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-[3px] left-0 size-3.5 rounded-full border-[3px]",
                first
                  ? "border-route-start bg-route-start"
                  : last
                    ? "border-route bg-route"
                    : "border-route bg-card"
              )}
            />
            <div className="flex min-h-5 min-w-0 items-baseline gap-2">
              <Formula compound={compound} className="text-sm font-semibold" />
              <span className="truncate text-[13px] text-muted-foreground">{compound.name}</span>
            </div>
            {!last && reaction && (
              <article className="reaction-audit-card mt-2 mb-4 rounded-lg border bg-muted/40 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-[15px] leading-snug font-semibold break-words">
                    {reaction.reaction}
                  </strong>
                  <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                    {reaction.reversible ? "Reversible" : "Directed"}
                  </Badge>
                </div>
                {reaction.equation && (
                  <code className="mt-2 block font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                    {reaction.equation}
                  </code>
                )}
                {reaction.conditions && (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">{reaction.conditions}</p>
                )}
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
