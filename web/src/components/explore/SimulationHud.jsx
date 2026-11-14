import Formula from "@/components/Formula.jsx";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FINAL_HOLD_MS } from "@/lib/constants.js";

export default function SimulationHud({ simulation, currentCompound, onSkip }) {
  if (!simulation.running) return null;

  const progress =
    simulation.total > 0
      ? Math.min(100, Math.round((simulation.step / simulation.total) * 100))
      : 0;

  return (
    <Card
      size="sm"
      role="status"
      className="absolute top-14 left-1/2 z-20 w-[min(380px,calc(100%-1.5rem))] -translate-x-1/2 gap-2 bg-overlay shadow-lg"
    >
      <CardHeader>
        <CardDescription>Replaying {simulation.algorithm}</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-base">
          {currentCompound ? <Formula compound={currentCompound} /> : "—"}
          {currentCompound && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {currentCompound.name}
            </span>
          )}
        </CardTitle>
        <CardAction>
          <Button size="sm" variant="outline" onClick={onSkip}>
            Skip
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={progress} className="h-1 [&>[data-slot=progress-indicator]]:bg-route" />
        <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
          <span>
            Step <b className="font-semibold text-foreground">{simulation.step}</b> of{" "}
            {simulation.total}
          </span>
          <span>
            Visited <b className="font-semibold text-foreground">{simulation.visited.length}</b>
          </span>
          <span>
            <b className="font-semibold text-foreground">{simulation.elapsed.toFixed(1)}</b> /{" "}
            {((simulation.duration ?? FINAL_HOLD_MS) / 1000).toFixed(1)} s
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
