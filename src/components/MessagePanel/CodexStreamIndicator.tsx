import { useBridgeStore } from "@/stores/bridge-store";
import { SourceBadge } from "./SourceBadge";
import { getCodexStreamIndicatorViewModel } from "./view-model";

export function CodexStreamIndicator() {
  const codexStream = useBridgeStore((s) => s.codexStream);
  const { thinking, currentDelta, reasoning, commandOutput } = codexStream;
  const viewModel = getCodexStreamIndicatorViewModel(codexStream);

  if (!viewModel.visible) return null;

  return (
    <div className="py-2">
      <div className="flex py-2.5 justify-start">
        <div className="max-w-[80%] rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge source="codex" />
            {viewModel.showStatusLabel && (
              <span
                className={`text-[11px] text-emerald-400 ${viewModel.animatePulse ? "animate-pulse" : ""}`}
              >
                {viewModel.statusLabel}
              </span>
            )}
          </div>
          {reasoning && !currentDelta && (
            <div className="text-[12px] text-foreground/50 italic whitespace-pre-wrap max-h-24 overflow-y-auto mb-1">
              {reasoning.length > 300 ? "…" + reasoning.slice(-300) : reasoning}
            </div>
          )}
          {commandOutput && !currentDelta && (
            <div className="text-[11px] text-emerald-300/70 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto mb-1 bg-black/20 rounded px-1.5 py-1">
              {commandOutput.length > 500
                ? "…" + commandOutput.slice(-500)
                : commandOutput}
            </div>
          )}
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
