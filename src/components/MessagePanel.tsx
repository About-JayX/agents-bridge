import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBridgeStore, type TerminalLine } from "@/stores/bridge-store";
import type { BridgeMessage, MessageSource } from "@/types";

const sourceStyle: Record<string, { label: string; className: string }> = {
  claude: {
    label: "Claude",
    className: "border-claude/40 bg-claude/10 text-claude",
  },
  codex: {
    label: "Codex",
    className: "border-codex/40 bg-codex/10 text-codex",
  },
  system: {
    label: "System",
    className: "border-system/40 bg-system/10 text-system",
  },
};

function SourceBadge({ source }: { source: MessageSource }) {
  const style = sourceStyle[source] ?? sourceStyle.system;
  return (
    <Badge variant="outline" className={cn("uppercase", style.className)}>
      {style.label}
    </Badge>
  );
}

interface MessagePanelProps {
  messages: BridgeMessage[];
}

export function MessagePanel({ messages }: MessagePanelProps) {
  const [tab, setTab] = useState<"messages" | "logs">("messages");
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const clearMessages = useBridgeStore((s) => s.clearMessages);
  const codexPhase = useBridgeStore((s) => s.codexPhase);
  const allTerminalLines = useBridgeStore((s) => s.terminalLines);

  // Split: system messages with "Claude →" go to logs, rest to messages
  const chatMessages = messages.filter((m) => m.source !== "system");
  const logLines: TerminalLine[] = [];
  for (const l of allTerminalLines) logLines.push(l);
  // Also add system messages from the message stream
  for (const m of messages) {
    if (m.source === "system") {
      logLines.push({
        agent: "system",
        kind: "text",
        line: m.content,
        timestamp: m.timestamp,
      });
    }
  }

  useEffect(() => {
    if (tab === "messages")
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    else if (logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, allTerminalLines, tab]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Tab header */}
      <div className="flex items-center px-4 py-2 border-b border-border gap-3">
        <button
          type="button"
          onClick={() => setTab("messages")}
          className={cn(
            "text-sm font-semibold transition-colors",
            tab === "messages"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Messages ({chatMessages.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("logs")}
          className={cn(
            "text-sm font-semibold transition-colors",
            tab === "logs"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Logs ({logLines.length})
        </button>
        <div className="flex-1" />
        <Button variant="secondary" size="xs" onClick={clearMessages}>
          Clear
        </Button>
      </div>

      {/* Messages tab */}
      {tab === "messages" && (
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {chatMessages.length === 0 && (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              No messages yet. Connect Claude and Codex to start bridging.
            </div>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className="py-2.5 border-b border-card">
              <div className="flex items-center gap-2 mb-1">
                <SourceBadge source={msg.source} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap wrap-break-word">
                {msg.content}
              </div>
            </div>
          ))}
          {codexPhase !== "idle" && (
            <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-codex animate-pulse" />
              {codexPhase === "thinking"
                ? "Codex is thinking…"
                : "Codex is responding…"}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Logs tab */}
      {tab === "logs" && (
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed"
        >
          {logLines.length === 0 && (
            <div className="py-10 text-center text-[13px] text-muted-foreground font-sans">
              No logs yet.
            </div>
          )}
          {logLines.map((l, i) => (
            <div
              key={i}
              className={cn("py-0.5", logKindColor(l.kind, l.agent))}
            >
              <span className="text-muted-foreground mr-2">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-muted-foreground mr-1">[{l.agent}]</span>
              {l.line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function logKindColor(kind: string, agent: string): string {
  if (kind === "error") return "text-destructive";
  if (kind === "tool_use") return "text-yellow-500/80";
  if (kind === "tool_result") return "text-muted-foreground";
  if (kind === "status") return "text-blue-400";
  if (agent === "claude") return "text-claude/70";
  return "text-foreground/60";
}
