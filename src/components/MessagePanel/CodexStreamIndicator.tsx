import { useBridgeStore } from "@/stores/bridge-store";
import { SourceBadge } from "./SourceBadge";

export function CodexStreamIndicator() {
  const codexStream = useBridgeStore((s) => s.codexStream);

  if (!codexStream.thinking && !codexStream.currentDelta) return null;

  return (
    <div className="flex py-2.5 justify-start msg-enter">
      <div className="max-w-[80%] rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/30">
        <div className="flex items-center gap-2 mb-1">
          <SourceBadge source="codex" />
          {codexStream.thinking && !codexStream.currentDelta && (
            <span className="text-[11px] text-emerald-400 animate-pulse">
              thinking…
            </span>
          )}
        </div>
        {codexStream.currentDelta && (
          <div className="text-[13px] text-foreground/80 whitespace-pre-wrap">
            {codexStream.currentDelta}
          </div>
        )}
      </div>
    </div>
  );
}
