import { CodexIcon } from "./BrandIcons";
import { RoleSelect } from "./RoleSelect";
import { StatusDot } from "./StatusDot";

interface CodexHeaderProps {
  running: boolean;
  connectionLabel: string | null;
}

export function CodexHeader({ running, connectionLabel }: CodexHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StatusDot
            status={running ? "connected" : "disconnected"}
            variant="codex"
          />
          <CodexIcon className="size-5 text-codex" />
        </div>
        <RoleSelect agent="codex" disabled={running} />
      </div>

      {connectionLabel && (
        <div className="mt-1 font-mono text-[11px] text-muted-foreground/80">
          {connectionLabel}
        </div>
      )}
    </>
  );
}
