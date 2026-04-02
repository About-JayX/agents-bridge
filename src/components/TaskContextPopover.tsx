import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Workflow, X } from "lucide-react";
import { Button } from "./ui/button";
import { AgentStatusPanel } from "./AgentStatus";
import { TaskPanel } from "./TaskPanel";
import { PermissionQueue } from "./MessagePanel/PermissionQueue";
import { useBridgeStore } from "@/stores/bridge-store";
import { cn } from "@/lib/utils";
import type { TaskInfo } from "@/stores/task-store/types";
import {
  getMountedShellPanes,
  type ShellSidebarPane,
} from "./shell-layout-state";

interface TaskContextPopoverProps {
  activePane: ShellSidebarPane | null;
  onClose: () => void;
  task: TaskInfo | null;
}

export function TaskContextPopover({
  activePane,
  onClose,
  task,
}: TaskContextPopoverProps) {
  const permissionPrompts = useBridgeStore((s) => s.permissionPrompts);
  const respondToPermission = useBridgeStore((s) => s.respondToPermission);
  const [mountedPanes, setMountedPanes] = useState<ShellSidebarPane[]>(() =>
    getMountedShellPanes([], activePane),
  );

  useEffect(() => {
    setMountedPanes((current) => getMountedShellPanes(current, activePane));
  }, [activePane]);

  useEffect(() => {
    if (!activePane) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePane, onClose]);
  const paneMeta = {
    task: {
      eyebrow: "Task context",
      title: task?.title ?? "Task workspace",
      icon: Workflow,
    },
    agents: {
      eyebrow: "Agents",
      title: "Runtime control",
      icon: Bot,
    },
    approvals: {
      eyebrow: "Approvals",
      title: "Permission queue",
      icon: AlertTriangle,
    },
  } satisfies Record<
    ShellSidebarPane,
    { eyebrow: string; title: string; icon: typeof Workflow }
  >;
  const activeMeta = activePane ? paneMeta[activePane] : paneMeta.task;
  const ActiveIcon = activeMeta.icon;

  return (
    <div
      data-shell-sidebar-panel="true"
      className={cn(
        "min-h-0 shrink-0 overflow-hidden border-r border-border/45 bg-background/92 transition-[width,opacity] duration-200",
        activePane ? "w-[24rem] opacity-100" : "w-0 opacity-0",
      )}
    >
      <div
        className={cn(
          "flex h-full w-[24rem] min-w-[24rem] flex-col",
          activePane ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div className="flex items-start justify-between border-b border-border/35 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border border-border/35 bg-background/55 p-2 text-muted-foreground/72">
              <ActiveIcon className="size-4" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
                {activeMeta.eyebrow}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-foreground">
                {activeMeta.title}
              </div>
            </div>
          </div>
          <Button size="xs" variant="ghost" onClick={onClose}>
            <X className="size-3.5" />
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {mountedPanes.includes("task") && (
            <div
              className={cn(
                "h-full overflow-y-auto px-4 py-4 text-[12px] text-muted-foreground/78",
                activePane === "task" ? "block" : "hidden",
              )}
            >
              <TaskPanel />
            </div>
          )}

          {mountedPanes.includes("agents") && (
            <div
              className={cn(
                "h-full overflow-y-auto px-4 py-4 text-[12px] text-muted-foreground/78",
                activePane === "agents" ? "block" : "hidden",
              )}
            >
              <AgentStatusPanel />
            </div>
          )}

          {mountedPanes.includes("approvals") && (
            <div
              className={cn(
                "h-full overflow-y-auto px-4 py-4 text-[12px] text-muted-foreground/78",
                activePane === "approvals" ? "block" : "hidden",
              )}
            >
              <PermissionQueue
                prompts={permissionPrompts}
                onResolve={respondToPermission}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
