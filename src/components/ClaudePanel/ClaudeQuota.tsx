import { cn } from "@/lib/utils";
import { useBridgeStore } from "@/stores/bridge-store";
import { formatTimeLeft, barColor } from "./helpers";

export function ClaudeQuota() {
  const rl = useBridgeStore((s) => s.claudeRateLimit);
  if (!rl) return null;

  const label = rl.rateLimitType === "five_hour" ? "5h" : rl.rateLimitType;
  const timeLeft = formatTimeLeft(rl.resetsAt);
  const isAllowed = rl.status === "allowed";

  // Estimate window progress from time (5h = 18000s window)
  const windowSecs = rl.rateLimitType === "five_hour" ? 18000 : 604800;
  const elapsed = windowSecs - Math.max(0, rl.resetsAt - Date.now() / 1000);
  const windowPercent = Math.min(
    100,
    Math.max(0, (elapsed / windowSecs) * 100),
  );

  return (
    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          Claude {"\u989D\u5EA6"}
        </span>
        <span
          className={cn(
            "rounded-full px-1.5 py-px text-[9px] font-semibold",
            isAllowed
              ? "bg-claude/10 text-claude"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {isAllowed ? "\u6B63\u5E38" : "\u53D7\u9650"}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">{label} window</span>
          <span className="font-mono text-muted-foreground">
            resets {timeLeft}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              barColor(rl.status),
            )}
            style={{ width: `${windowPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
