import { useState } from "react";
import { Bot, Workflow } from "lucide-react";
import { TaskContextPopover } from "@/components/TaskContextPopover";
import { useTaskStore } from "@/stores/task-store";
import { selectActiveTask } from "@/stores/task-store/selectors";

type SidebarPane = "context" | "agents";

export function ShellContextBar() {
  const [activePane, setActivePane] = useState<SidebarPane | null>(null);
  const activeTask = useTaskStore(selectActiveTask);

  const togglePane = (pane: SidebarPane) => {
    setActivePane((current) => (current === pane ? null : pane));
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-y-0 left-0 z-30 flex items-center">
        <div className="pointer-events-auto ml-2 flex w-16 flex-col items-center gap-3 rounded-3xl border border-border/45 bg-background/90 px-2 py-4 shadow-xl backdrop-blur-sm lg:ml-4">
          <button
            type="button"
            data-shell-pane-trigger="true"
            aria-label="Open task context"
            aria-pressed={activePane === "context"}
            className="group relative flex size-11 items-center justify-center rounded-2xl border border-transparent bg-background/35 text-muted-foreground/72 transition-colors hover:border-border/55 hover:bg-card/80 hover:text-foreground/88 aria-pressed:border-primary/40 aria-pressed:bg-card aria-pressed:text-foreground"
            onClick={() => togglePane("context")}
          >
            <span className="sr-only">Task context</span>
            <Workflow className="size-4" />
            {activePane === "context" && (
              <span className="absolute -left-2 h-6 w-1 rounded-full bg-primary" />
            )}
          </button>

          <button
            type="button"
            data-shell-pane-trigger="true"
            aria-label="Open agents"
            aria-pressed={activePane === "agents"}
            className="group relative flex size-11 items-center justify-center rounded-2xl border border-transparent bg-background/35 text-muted-foreground/72 transition-colors hover:border-border/55 hover:bg-card/80 hover:text-foreground/88 aria-pressed:border-primary/40 aria-pressed:bg-card aria-pressed:text-foreground"
            onClick={() => togglePane("agents")}
          >
            <span className="sr-only">Agents</span>
            <Bot className="size-4" />
            {activePane === "agents" && (
              <span className="absolute -left-2 h-6 w-1 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      <TaskContextPopover
        activePane={activePane}
        onClose={() => setActivePane(null)}
        task={activeTask}
      />
    </>
  );
}
