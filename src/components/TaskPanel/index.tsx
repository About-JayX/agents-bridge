import { useCallback, useMemo } from "react";
import {
  useTaskStore,
} from "@/stores/task-store";
import {
  selectActiveTask,
  selectActiveTaskArtifacts,
  selectActiveTaskSessions,
} from "@/stores/task-store/selectors";
import { ArtifactTimeline } from "./ArtifactTimeline";
import { SessionTree } from "./SessionTree";
import { TaskHeader } from "./TaskHeader";
import {
  buildArtifactTimeline,
  buildSessionTreeRows,
  getTaskPanelEmptyStateMessage,
  getReviewBadge,
} from "./view-model";

export function TaskPanel() {
  const task = useTaskStore(selectActiveTask);
  const taskSessions = useTaskStore(selectActiveTaskSessions);
  const taskArtifacts = useTaskStore(selectActiveTaskArtifacts);
  const resumeSession = useTaskStore((s) => s.resumeSession);

  const reviewBadge = useMemo(
    () => getReviewBadge(task?.reviewStatus),
    [task?.reviewStatus],
  );
  const sessionRows = useMemo(
    () => buildSessionTreeRows(taskSessions, task),
    [task, taskSessions],
  );
  const artifactTimeline = useMemo(
    () => buildArtifactTimeline(taskArtifacts, taskSessions),
    [taskArtifacts, taskSessions],
  );

  const handleResume = useCallback(
    (sessionId: string) => {
      void resumeSession(sessionId);
    },
    [resumeSession],
  );

  if (!task) {
    return (
      <section className="rounded-2xl border border-border/40 bg-card/45 px-4 py-4">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
          Inspector
        </div>
        <div className="rounded-xl border border-dashed border-border/40 bg-background/20 px-4 py-3 text-xs text-muted-foreground/65">
          {getTaskPanelEmptyStateMessage()}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-border/40 bg-card/55 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
              Inspector
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              Session context
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground/65">
            {taskSessions.length} sessions · {taskArtifacts.length} artifacts
          </div>
        </div>
        <TaskHeader task={task} reviewBadge={reviewBadge} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border border-border/35 bg-background/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
              Active sessions
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {taskSessions.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/35 bg-background/30 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
              Artifacts
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {taskArtifacts.length}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl border border-border/40 bg-card/45 p-0">
          <SessionTree rows={sessionRows} onResume={handleResume} />
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/45 p-0">
          <ArtifactTimeline items={artifactTimeline} />
        </div>
      </div>
    </section>
  );
}
