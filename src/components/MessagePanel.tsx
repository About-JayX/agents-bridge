import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBridgeStore } from "@/stores/bridge-store";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const clearMessages = useBridgeStore((s) => s.clearMessages);
  const codexPhase = useBridgeStore((s) => s.codexPhase);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center px-4 py-3 border-b border-border">
        <h3 className="flex-1 m-0 text-sm font-semibold text-foreground">
          Messages ({messages.length})
        </h3>
        <Button variant="secondary" size="xs" onClick={clearMessages}>
          Clear
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.length === 0 && (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            No messages yet. Connect Claude Code and Codex to start bridging.
          </div>
        )}

        {messages.map((msg) => (
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
    </div>
  );
}
