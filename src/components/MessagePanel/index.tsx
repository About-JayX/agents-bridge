import { useState, useEffect, useMemo, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import { useBridgeStore } from "@/stores/bridge-store";
import { selectMessages } from "@/stores/bridge-store/selectors";
import { useTaskStore } from "@/stores/task-store";
import { selectActiveTask } from "@/stores/task-store/selectors";
import { PermissionQueue } from "./PermissionQueue";
import { MessageList } from "./MessageList";
import { ReviewGateBadge } from "@/components/TaskPanel/ReviewGateBadge";
import { getReviewBadge } from "@/components/TaskPanel/view-model";
import {
  filterRenderableChatMessages,
  formatTerminalTimestamp,
} from "./view-model";
import { AlertTriangle, ChevronDown, TerminalSquare } from "lucide-react";

type SecondaryPanel = "logs" | "approvals" | null;

interface MessagePanelProps {
  onTabChange?: (tab: "messages" | "logs" | "approvals") => void;
}

export function MessagePanel({ onTabChange }: MessagePanelProps) {
  const [secondaryPanel, setSecondaryPanel] = useState<SecondaryPanel>(null);
  const previousPermissionCountRef = useRef(0);

  const clearMessages = useBridgeStore((s) => s.clearMessages);
  const messages = useBridgeStore(selectMessages);
  const allTerminalLines = useBridgeStore((s) => s.terminalLines);
  const permissionPrompts = useBridgeStore((s) => s.permissionPrompts);
  const respondToPermission = useBridgeStore((s) => s.respondToPermission);
  const claudeNeedsAttention = useBridgeStore((s) => s.claudeNeedsAttention);
  const clearClaudeAttention = useBridgeStore((s) => s.clearClaudeAttention);
  const activeTask = useTaskStore(selectActiveTask);
  const reviewBadge = getReviewBadge(activeTask?.reviewStatus);

  const chatMessages = useMemo(
    () => filterRenderableChatMessages(messages),
    [messages],
  );
  const errorLines = useMemo(
    () => allTerminalLines.filter((l) => l.kind === "error"),
    [allTerminalLines],
  );

  useEffect(() => {
    if (claudeNeedsAttention) {
      clearClaudeAttention();
    }
  }, [claudeNeedsAttention, clearClaudeAttention]);

  useEffect(() => {
    const previousCount = previousPermissionCountRef.current;
    previousPermissionCountRef.current = permissionPrompts.length;
    if (
      permissionPrompts.length > 0 &&
      previousCount === 0 &&
      secondaryPanel === null
    ) {
      setSecondaryPanel("approvals");
      onTabChange?.("approvals");
    }
  }, [permissionPrompts.length, secondaryPanel, onTabChange]);

  const toggleSecondaryPanel = (panel: Exclude<SecondaryPanel, null>) => {
    setSecondaryPanel((current) => {
      const next = current === panel ? null : panel;
      onTabChange?.(next ?? "messages");
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-3 border-b border-border/45 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
            Conversation
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <div className="truncate text-sm font-semibold text-foreground">
              Primary timeline
            </div>
            <span className="rounded-full border border-border/45 px-2 py-0.5 text-[10px] text-muted-foreground">
              {chatMessages.length} messages
            </span>
            {activeTask && (
              <span className="hidden truncate rounded-full border border-border/45 px-2 py-0.5 text-[10px] text-muted-foreground lg:inline-flex">
                {activeTask.title}
              </span>
            )}
            {reviewBadge && <ReviewGateBadge badge={reviewBadge} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={secondaryPanel === "logs" ? "secondary" : "outline"}
            size="xs"
            onClick={() => toggleSecondaryPanel("logs")}
          >
            <TerminalSquare className="size-3.5" />
            Logs
            {errorLines.length > 0 && ` (${errorLines.length})`}
          </Button>
          <Button
            variant={secondaryPanel === "approvals" ? "secondary" : "outline"}
            size="xs"
            onClick={() => toggleSecondaryPanel("approvals")}
          >
            <AlertTriangle className="size-3.5" />
            Approvals
            {permissionPrompts.length > 0 && ` (${permissionPrompts.length})`}
          </Button>
          <Button variant="secondary" size="xs" onClick={clearMessages}>
            Clear
          </Button>
        </div>
      </div>
      <MessageList messages={chatMessages} />
      {secondaryPanel && (
        <div className="flex h-[32%] min-h-[220px] flex-col border-t border-border/45 bg-card/55">
          <div className="flex items-center justify-between border-b border-border/35 px-4 py-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                {secondaryPanel === "logs" ? "Diagnostics" : "Approvals"}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground/75">
                {secondaryPanel === "logs"
                  ? "Secondary runtime detail stays docked below the main timeline."
                  : "Permission requests stay visible without replacing the conversation."}
              </div>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setSecondaryPanel(null);
                onTabChange?.("messages");
              }}
            >
              <ChevronDown className="size-3.5" />
              Close
            </Button>
          </div>
          {secondaryPanel === "logs" && (
            <div className="flex-1 min-h-0">
              {allTerminalLines.length === 0 && (
                <div className="py-10 text-center text-[13px] text-muted-foreground font-sans">
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
                      <span className="opacity-50 mr-2">
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
          {secondaryPanel === "approvals" && (
            <PermissionQueue
              prompts={permissionPrompts}
              onResolve={respondToPermission}
            />
          )}
        </div>
      )}
    </div>
  );
}
