import { useMemo } from "react";
import { useBridgeStore } from "@/stores/bridge-store";
import { SourceBadge } from "./SourceBadge";
import {
  getCodexStreamIndicatorViewModel,
  getStreamTextTail,
} from "./view-model";

export function CodexStreamIndicator() {
  const thinking = useBridgeStore((s) => s.codexStream.thinking);
  const currentDelta = useBridgeStore((s) => s.codexStream.currentDelta);
  const activity = useBridgeStore((s) => s.codexStream.activity);
  const reasoning = useBridgeStore((s) => s.codexStream.reasoning);
  const commandOutput = useBridgeStore((s) => s.codexStream.commandOutput);
  const codexStream = {
    thinking,
    currentDelta,
    lastMessage: "",
    turnStatus: "",
    activity,
    reasoning,
    commandOutput,
  };
  const viewModel = getCodexStreamIndicatorViewModel(codexStream);
  const displayReasoning = useMemo(
    () => getStreamTextTail(reasoning, 300),
    [reasoning],
  );
  const displayCommandOutput = useMemo(
    () => getStreamTextTail(commandOutput, 500),
    [commandOutput],
  );

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
              {displayReasoning}
            </div>
          )}
          {commandOutput && !currentDelta && (
            <div className="text-[11px] text-emerald-300/70 font-mono whitespace-pre-wrap max-h-20 overflow-y-auto mb-1 bg-black/20 rounded px-1.5 py-1">
              {displayCommandOutput}
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
