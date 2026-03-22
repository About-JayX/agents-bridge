import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useBridgeStore, type TerminalLine } from "@/stores/bridge-store";

interface ClaudePanelProps {
  connected: boolean;
}

export function ClaudePanel({ connected }: ClaudePanelProps) {
  const [mcpRegistered, setMcpRegistered] = useState<boolean | null>(null);
  const [inputText, setInputText] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);

  // Stable selector: get raw array reference, filter in render
  const allLines = useBridgeStore((s) => s.terminalLines);
  const launchClaude = useBridgeStore((s) => s.launchClaude);
  const sendClaudeInput = useBridgeStore((s) => s.sendClaudeInput);
  const stopClaude = useBridgeStore((s) => s.stopClaude);

  // Filter outside selector to avoid new-reference infinite loop
  const claudeLines: TerminalLine[] = [];
  for (const l of allLines) {
    if (l.agent === "claude") claudeLines.push(l);
  }
  const hasTerminal = claudeLines.length > 0;

  useEffect(() => {
    invoke<boolean>("check_mcp_registered")
      .then(setMcpRegistered)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [allLines]);

  const handleLaunch = useCallback(async () => {
    if (!mcpRegistered) {
      try {
        await invoke("register_mcp");
        setMcpRegistered(true);
      } catch {}
    }
    launchClaude();
  }, [mcpRegistered, launchClaude]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    sendClaudeInput(text);
    setInputText("");
  }, [inputText, sendClaudeInput]);

  return (
    <div className="rounded-lg border border-input bg-card p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-2 shrink-0 rounded-full",
            connected
              ? "bg-claude"
              : hasTerminal
                ? "bg-yellow-500 animate-pulse"
                : "bg-muted-foreground",
          )}
        />
        <span className="flex-1 text-[13px] font-medium text-card-foreground">
          Claude Code
        </span>
        <span className="text-[11px] uppercase text-secondary-foreground">
          {connected ? "connected" : hasTerminal ? "starting" : "disconnected"}
        </span>
      </div>

      {/* Terminal output */}
      {hasTerminal && (
        <div
          ref={terminalRef}
          className="mt-2 max-h-32 overflow-y-auto rounded-md bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/80"
        >
          {claudeLines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">
              {l.line}
            </div>
          ))}
        </div>
      )}

      {/* Input (when running) */}
      {hasTerminal && (
        <div className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Send input to Claude..."
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <Button size="xs" variant="secondary" onClick={handleSend}>
            Send
          </Button>
          <Button size="xs" variant="destructive" onClick={stopClaude}>
            Stop
          </Button>
        </div>
      )}

      {/* Launch button */}
      {!hasTerminal && !connected && (
        <div className="mt-2">
          <Button
            size="sm"
            className="w-full bg-claude text-white hover:bg-claude/80"
            onClick={handleLaunch}
          >
            Connect Claude
          </Button>
        </div>
      )}

      {/* Connected info */}
      {connected && !hasTerminal && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">MCP</span>
            <span className="font-medium text-codex">registered</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Tools</span>
            <span className="font-mono text-secondary-foreground">
              reply · check · status
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
