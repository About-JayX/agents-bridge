import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CodexAccountPanel } from "@/components/CodexAccountPanel";
import { RoleSelect } from "./RoleSelect";

interface CodexPanelProps {
  codexTuiRunning: boolean;
  codexReady: boolean;
  threadId: string | null;
  launchCodexTui: () => void;
  stopCodexTui: () => void;
  profile: any;
  usage: any;
  refreshing: boolean;
  refreshUsage: () => void;
  codexAccount: any;
}

export function CodexPanel({
  codexTuiRunning,
  codexReady,
  threadId,
  launchCodexTui,
  stopCodexTui,
  profile,
  usage,
  refreshing,
  refreshUsage,
  codexAccount,
}: CodexPanelProps) {
  return (
    <div className="rounded-lg border border-input bg-card p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-2 shrink-0 rounded-full",
            codexTuiRunning
              ? "bg-codex"
              : codexReady
                ? "bg-yellow-500"
                : "bg-muted-foreground",
          )}
        />
        <span className="flex-1 text-[13px] font-medium text-card-foreground">
          Codex
        </span>
        <RoleSelect agent="codex" disabled={codexTuiRunning} />
        <span className="text-[11px] uppercase text-secondary-foreground">
          {codexTuiRunning ? "connected" : codexReady ? "ready" : "starting..."}
        </span>
      </div>

      {threadId && (
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          Thread: {threadId.slice(0, 16)}...
        </div>
      )}

      <div className="mt-2">
        {!codexTuiRunning ? (
          <Button
            className="w-full bg-codex text-white hover:bg-codex/80"
            size="sm"
            disabled={!codexReady}
            onClick={launchCodexTui}
          >
            Connect Codex
          </Button>
        ) : (
          <Button
            className="w-full"
            variant="secondary"
            size="sm"
            onClick={stopCodexTui}
          >
            Disconnect Codex
          </Button>
        )}
      </div>

      <CodexAccountPanel
        profile={profile}
        usage={usage}
        refreshing={refreshing}
        onRefresh={refreshUsage}
        protocolData={codexAccount}
      />

      {!codexReady && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          Codex app-server is starting...
        </div>
      )}
    </div>
  );
}
