import { useEffect } from "react";
import { X } from "lucide-react";
import { AgentStatusPanel } from "./AgentStatus";
import { TaskPanel } from "./TaskPanel";
import { Button } from "./ui/button";

interface MobileInspectorSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileInspectorSheet({
  open,
  onClose,
}: MobileInspectorSheetProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Close inspector"
        className="absolute inset-0 bg-background/72 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 top-16 overflow-hidden rounded-t-[28px] border border-border/45 bg-background/96 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/55">
              Inspector
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              Runtime control and task context
            </div>
          </div>
          <Button size="xs" variant="ghost" onClick={onClose}>
            <X className="size-3.5" />
            Close inspector
          </Button>
        </div>

        <div className="h-full overflow-y-auto px-4 py-4">
          <div className="space-y-4 pb-20">
            <AgentStatusPanel />
            <TaskPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
