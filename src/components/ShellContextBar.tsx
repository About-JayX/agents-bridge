import { useEffect, useState } from "react";
import { FolderTree, AlertTriangle, PanelLeft, TerminalSquare } from "lucide-react";
import { StatusDot } from "@/components/AgentStatus/StatusDot";
import { useBridgeStore } from "@/stores/bridge-store";
import { Button } from "@/components/ui/button";
import { TaskContextPopover } from "@/components/TaskContextPopover";
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

export function ShellContextBar({
  mobileInspectorOpen = false,
  onToggleMobileInspector,
}: {
  mobileInspectorOpen?: boolean;
  onToggleMobileInspector?: () => void;
}) {
  const [taskContextOpen, setTaskContextOpen] = useState(false);
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

  useEffect(() => {
    if (mobileInspectorOpen) {
      setTaskContextOpen(false);
    }
  }, [mobileInspectorOpen]);

  return (
    <header className="relative border-b border-border/45 bg-background/95">
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
          <button
            type="button"
            className="min-w-[210px] max-w-[320px] rounded-xl border border-border/40 bg-card/60 px-3 py-2 text-left transition-colors hover:border-border/65 hover:bg-card/80"
            onClick={() => setTaskContextOpen((open) => !open)}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">
              Task context
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <PanelLeft className="size-3.5 text-muted-foreground/65" />
              <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                {activeTask ? activeTask.title : "No task"}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/68">
              <FolderTree className="size-3.5" />
              {activeTask ? `${sessionCount} sessions · ${artifactCount} artifacts` : "Open summary"}
            </div>
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {onToggleMobileInspector && (
            <Button
              size="xs"
              variant={mobileInspectorOpen ? "secondary" : "outline"}
              className="lg:hidden"
              onClick={onToggleMobileInspector}
            >
              {mobileInspectorOpen ? "Close inspector" : "Open inspector"}
            </Button>
          )}
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

      <TaskContextPopover
        open={taskContextOpen}
        onClose={() => setTaskContextOpen(false)}
        task={activeTask}
        sessionCount={sessionCount}
        artifactCount={artifactCount}
      />
    </header>
  );
}
