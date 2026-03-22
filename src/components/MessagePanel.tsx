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

type Tab = "messages" | "terminal" | "logs";

interface MessagePanelProps {
  messages: BridgeMessage[];
  onTabChange?: (tab: "messages" | "terminal" | "logs") => void;
}

export function MessagePanel({ messages, onTabChange }: MessagePanelProps) {
  const [tab, setTabState] = useState<Tab>("messages");
  const setTab = (t: Tab) => {
    setTabState(t);
    onTabChange?.(t);
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const clearMessages = useBridgeStore((s) => s.clearMessages);
  const codexPhase = useBridgeStore((s) => s.codexPhase);
  const allTerminalLines = useBridgeStore((s) => s.terminalLines);

  const [termInput, setTermInput] = useState("");
  const sendClaudeInput = useBridgeStore((s) => s.sendClaudeInput);

  const chatMessages = messages.filter((m) => m.source !== "system");

  // Terminal: raw + user_input lines from claude
  const termLines: TerminalLine[] = [];
  for (const l of allTerminalLines) {
    if (l.agent === "claude" && (l.kind === "raw" || l.kind === "user_input"))
      termLines.push(l);
  }

  // Logs: errors only
  const errorLines: TerminalLine[] = [];
  for (const l of allTerminalLines) {
    if (l.kind === "error") errorLines.push(l);
  }

  useEffect(() => {
    if (tab === "messages")
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    else if (tab === "terminal" && termRef.current)
      termRef.current.scrollTop = termRef.current.scrollHeight;
    else if (tab === "logs" && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, allTerminalLines, tab]);

  // Listen for switch-to-terminal event from ClaudePanel
  useEffect(() => {
    const handler = () => setTab("terminal");
    window.addEventListener("switch-to-terminal", handler);
    return () => window.removeEventListener("switch-to-terminal", handler);
  }, []);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Tabs */}
      <div className="flex items-center px-4 py-2 border-b border-border gap-3">
        <TabBtn active={tab === "messages"} onClick={() => setTab("messages")}>
          Messages ({chatMessages.length})
        </TabBtn>
        <TabBtn active={tab === "terminal"} onClick={() => setTab("terminal")}>
          Terminal {termLines.length > 0 && `(${termLines.length})`}
        </TabBtn>
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
          Logs {errorLines.length > 0 && `(${errorLines.length})`}
        </TabBtn>
        <div className="flex-1" />
        <Button variant="secondary" size="xs" onClick={clearMessages}>
          Clear
        </Button>
      </div>

      {/* Messages */}
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

      {/* Terminal (Claude process raw output + input) */}
      {tab === "terminal" && (
        <div className="flex flex-1 flex-col min-h-0">
          <div
            ref={termRef}
            className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed bg-[#0d0d0d]"
          >
            {termLines.length === 0 && (
              <div className="py-10 text-center text-[13px] text-muted-foreground font-sans">
                Claude not started. Connect Claude to see terminal output.
              </div>
            )}
            {termLines.map((l, i) => (
              <div
                key={i}
                className={cn(
                  "py-px whitespace-pre-wrap",
                  l.kind === "user_input" ? "text-codex" : "text-foreground/70",
                )}
              >
                {l.kind === "user_input" && (
                  <span className="text-codex mr-1">❯</span>
                )}
                {l.line}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-t border-border bg-[#0d0d0d]">
            <span className="text-codex font-mono text-[12px] py-1">❯</span>
            <input
              type="text"
              value={termInput}
              onChange={(e) => setTermInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const text = termInput.trim();
                  if (text) {
                    sendClaudeInput(text);
                    setTermInput("");
                  }
                }
              }}
              placeholder="Type here..."
              className="flex-1 bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      )}

      {/* Logs (errors only) */}
      {tab === "logs" && (
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed"
        >
          {errorLines.length === 0 && (
            <div className="py-10 text-center text-[13px] text-muted-foreground font-sans">
              No errors.
            </div>
          )}
          {errorLines.map((l, i) => (
            <div key={i} className="py-0.5 text-destructive">
              <span className="text-destructive/50 mr-2">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span className="mr-1">[{l.agent}]</span>
              {l.line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm font-semibold transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
