import { useBridgeStore } from "@/stores/bridge-store";
import { SourceBadge } from "./SourceBadge";

export function CodexStreamIndicator() {
  const { thinking, currentDelta } = useBridgeStore((s) => s.codexStream);

  if (!thinking && !currentDelta) return null;

  return (
    <div className="py-2">
      <div className="flex py-2.5 justify-start">
        <div className="max-w-[80%] rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge source="codex" />
            {thinking && (
              <span className="text-[11px] text-emerald-400 animate-pulse">
                {currentDelta ? "streaming…" : "thinking…"}
              </span>
            )}
          </div>
          {currentDelta && (
            <div className="text-[13px] text-foreground/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {currentDelta}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
