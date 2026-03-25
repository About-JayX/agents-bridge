import { RoleSelect } from "./RoleSelect";
import { StatusDot } from "./StatusDot";

interface CodexHeaderProps {
  running: boolean;
  ready: boolean;
  threadId: string | null;
}

export function CodexHeader({ running, ready, threadId }: CodexHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <StatusDot
          status={running ? "connected" : ready ? "connecting" : "disconnected"}
          variant="codex"
        />
        <span className="flex-1 text-[13px] font-medium text-card-foreground">
          Codex
        </span>
        <RoleSelect agent="codex" disabled={running} />
        <span
          key={running ? "c" : ready ? "r" : "s"}
          className="text-[11px] uppercase text-secondary-foreground status-flash"
        >
          {running ? "connected" : ready ? "ready" : "starting..."}
        </span>
      </div>

      {threadId && (
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          Thread: {threadId.slice(0, 16)}...
        </div>
      )}
    </>
  );
}
