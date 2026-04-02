import { FolderTree, AlertTriangle, Workflow, TerminalSquare } from "lucide-react";
import { shortenPath } from "@/lib/utils";
import { StatusDot } from "@/components/AgentStatus/StatusDot";
import { ReviewGateBadge } from "@/components/TaskPanel/ReviewGateBadge";
import { getReviewBadge } from "@/components/TaskPanel/view-model";
import { useBridgeStore } from "@/stores/bridge-store";
import {
  selectConnected,
  selectPermissionPromptCount,
  selectTerminalErrorCount,
} from "@/stores/bridge-store/selectors";
import { useTaskStore } from "@/stores/task-store";
import {
  selectActiveTask,
  selectActiveTaskArtifactCount,
  selectActiveTaskSessionCount,
} from "@/stores/task-store/selectors";

function StatusPill({
  label,
  status,
  variant,
}: {
  label: string;
  status: string;
  variant?: "claude" | "codex" | "generic";
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/45 bg-background/50 px-2.5 py-1 text-[10px] text-muted-foreground">
      <StatusDot status={status} variant={variant ?? "generic"} />
      <span className="font-medium text-foreground/85">{label}</span>
      <span className="uppercase tracking-[0.12em] text-muted-foreground/65">
        {status}
      </span>
    </div>
  );
}

export function ShellContextBar() {
  const connected = useBridgeStore(selectConnected);
  const claudeStatus = useBridgeStore(
    (s) => s.agents.claude?.status ?? "disconnected",
  );
  const codexStatus = useBridgeStore(
    (s) => s.agents.codex?.status ?? "disconnected",
  );
  const permissionCount = useBridgeStore(selectPermissionPromptCount);
  const errorCount = useBridgeStore(selectTerminalErrorCount);
  const activeTask = useTaskStore(selectActiveTask);
  const sessionCount = useTaskStore(selectActiveTaskSessionCount);
  const artifactCount = useTaskStore(selectActiveTaskArtifactCount);
  const reviewBadge = getReviewBadge(activeTask?.reviewStatus);

  return (
    <header className="border-b border-border/45 bg-background/95">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-[180px] items-center gap-3">
          <div className="rounded-xl border border-border/45 bg-card/80 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/55">
              AgentNexus
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <div className="text-sm font-semibold text-foreground">
                Runtime
              </div>
              <StatusDot
                status={connected ? "connected" : "error"}
                variant="generic"
              />
              <span className="text-[11px] text-muted-foreground">
                {connected ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center">
          {activeTask ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-card/70 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
                  Current Task
                </div>
                <div className="truncate text-sm font-semibold text-foreground">
                  {activeTask.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/70">
                  <span className="inline-flex items-center gap-1.5">
                    <FolderTree className="size-3.5" />
                    {shortenPath(activeTask.workspaceRoot)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Workflow className="size-3.5" />
                    {sessionCount} sessions
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <TerminalSquare className="size-3.5" />
                    {artifactCount} artifacts
                  </span>
                </div>
              </div>
              {reviewBadge && <ReviewGateBadge badge={reviewBadge} />}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-dashed border-border/45 bg-card/30 px-4 py-3 text-[12px] text-muted-foreground/70">
              No active task selected. The conversation timeline stays live, but task context and review state will appear here once a task is active.
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusPill label="Claude" status={claudeStatus} variant="claude" />
          <StatusPill label="Codex" status={codexStatus} variant="codex" />
          {permissionCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium text-amber-300">
              <AlertTriangle className="size-3.5" />
              {permissionCount} approvals waiting
            </div>
          )}
          {errorCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-[10px] font-medium text-destructive">
              <TerminalSquare className="size-3.5" />
              {errorCount} log errors
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
