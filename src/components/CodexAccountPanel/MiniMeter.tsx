import { cn } from "@/lib/utils";
import { barColor } from "./helpers";

export function MiniMeter({
  label,
  used,
  remaining,
}: {
  label: string;
  used: number;
  remaining: number;
}) {
  const u = Math.min(used, 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono font-semibold",
            u >= 90 ? "text-destructive" : "text-foreground",
          )}
        >
          {Math.round(remaining)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor(u))}
          style={{ width: `${u}%` }}
        />
      </div>
    </div>
  );
}
