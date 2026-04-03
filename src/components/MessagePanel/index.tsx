import { useEffect, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useBridgeStore } from "@/stores/bridge-store";
import { selectMessages } from "@/stores/bridge-store/selectors";
import { MessageList } from "./MessageList";
import {
  filterRenderableChatMessages,
  formatTerminalTimestamp,
} from "./view-model";
import type { ShellMainSurface } from "@/components/shell-layout-state";

interface MessagePanelProps {
  surfaceMode: ShellMainSurface;
}

export function MessagePanel({ surfaceMode }: MessagePanelProps) {
  const messages = useBridgeStore(selectMessages);
  const allTerminalLines = useBridgeStore((s) => s.terminalLines);
  const claudeNeedsAttention = useBridgeStore((s) => s.claudeNeedsAttention);
  const clearClaudeAttention = useBridgeStore((s) => s.clearClaudeAttention);

  const chatMessages = useMemo(
    () => filterRenderableChatMessages(messages),
    [messages],
  );

  useEffect(() => {
    if (claudeNeedsAttention) {
      clearClaudeAttention();
    }
  }, [claudeNeedsAttention, clearClaudeAttention]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {surfaceMode === "chat" && <MessageList messages={chatMessages} />}

      {surfaceMode === "logs" && (
        <div className="flex-1 min-h-0">
          {allTerminalLines.length === 0 && (
            <div className="py-10 text-center font-sans text-[13px] text-muted-foreground">
              No logs.
            </div>
          )}
          {allTerminalLines.length > 0 && (
            <Virtuoso
              data={allTerminalLines}
              className="h-full px-4 py-2 font-mono text-[11px] leading-relaxed"
              increaseViewportBy={160}
              itemContent={(_, line) => (
                <div
                  className={`py-0.5 ${line.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  <span className="mr-2 opacity-50">
                    {formatTerminalTimestamp(line.timestamp)}
                  </span>
                  <span className="mr-1 text-secondary-foreground">
                    [{line.agent}]
                  </span>
                  {line.line}
                </div>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}
