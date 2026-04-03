import {
  AlertTriangle,
  Bot,
  MessageSquare,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import type { ShellNavItem } from "./shell-layout-state";

interface ShellContextBarProps {
  activeItem: ShellNavItem | null;
  messageCount: number;
  onToggle: (item: ShellNavItem) => void;
}

const NAV_ITEMS: Array<{
  id: ShellNavItem;
  label: string;
  icon: typeof Workflow;
}> = [
  { id: "task", label: "Task context", icon: Workflow },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "approvals", label: "Approvals", icon: AlertTriangle },
  { id: "logs", label: "Logs", icon: TerminalSquare },
];

export function ShellContextBar({
  activeItem,
  messageCount,
  onToggle,
}: ShellContextBarProps) {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center border-r border-border/45 bg-background/78 px-2 py-4 backdrop-blur-sm">
      <nav className="flex flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-shell-pane-trigger="true"
            aria-label={`Open ${label.toLowerCase()}`}
            aria-pressed={activeItem === id}
            className="group relative flex size-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground/72 transition-colors hover:border-border/55 hover:bg-card/80 hover:text-foreground/88 aria-pressed:border-primary/40 aria-pressed:bg-card aria-pressed:text-foreground"
            onClick={() => onToggle(id)}
          >
            <span className="sr-only">{label}</span>
            <Icon className="size-4" />
            {activeItem === id && (
              <span className="absolute -left-2 h-5 w-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 text-muted-foreground/50">
        <MessageSquare className="size-3.5" />
        <span className="text-[9px] tabular-nums">{messageCount}</span>
      </div>
    </aside>
  );
}
