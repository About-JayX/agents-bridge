import { cn } from "@/lib/utils";
import { MiniMeter } from "@/components/CodexAccountPanel/MiniMeter";
import { windowLabel } from "@/components/CodexAccountPanel/helpers";

interface UsageWindow {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes: number | null;
}

export interface CodexUsageData {
  allowed: boolean;
  limitReached: boolean;
  primary: UsageWindow | null;
  secondary: UsageWindow | null;
}

interface CodexUsageSectionProps {
  usage: CodexUsageData;
  refreshing: boolean;
  refreshUsage: () => void;
}

export function CodexUsageSection({
  usage,
  refreshing,
  refreshUsage,
}: CodexUsageSectionProps) {
  return (
    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {"\u7528\u91CF"}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-px text-[9px] font-semibold",
              usage.limitReached || !usage.allowed
                ? "bg-destructive/10 text-destructive"
                : "bg-codex/10 text-codex",
            )}
          >
            {usage.limitReached || !usage.allowed
              ? "\u53D7\u9650"
              : "\u6B63\u5E38"}
          </span>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={refreshUsage}
          className={cn(
            "text-[10px] text-muted-foreground hover:text-foreground transition-colors",
            refreshing && "opacity-50",
          )}
        >
          {refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MiniMeter
          label={windowLabel(
            usage.primary?.windowMinutes ?? null,
            "\u77ED\u671F",
          )}
          used={usage.primary?.usedPercent ?? 0}
          remaining={usage.primary?.remainingPercent ?? 100}
        />
        <MiniMeter
          label={windowLabel(
            usage.secondary?.windowMinutes ?? null,
            "\u957F\u671F",
          )}
          used={usage.secondary?.usedPercent ?? 0}
          remaining={usage.secondary?.remainingPercent ?? 100}
        />
      </div>
    </div>
  );
}
