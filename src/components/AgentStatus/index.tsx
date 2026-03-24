import { useEffect } from "react";
import { ClaudePanel } from "@/components/ClaudePanel";
import { useBridgeStore } from "@/stores/bridge-store";
import { useCodexAccountStore } from "@/stores/codex-account-store";
import type { AgentInfo, DaemonStatus } from "@/types";
import { StatusDot } from "./StatusDot";
import { CodexPanel } from "./CodexPanel";

interface AgentStatusProps {
  agents: Record<string, AgentInfo>;
  daemonStatus: DaemonStatus | null;
  connected: boolean;
}

export function AgentStatusPanel({
  agents,
  daemonStatus,
  connected,
}: AgentStatusProps) {
  const launchCodexTui = useBridgeStore((s) => s.launchCodexTui);
  const stopCodexTui = useBridgeStore((s) => s.stopCodexTui);
  const profile = useCodexAccountStore((s) => s.profile);
  const usage = useCodexAccountStore((s) => s.usage);
  const refreshing = useCodexAccountStore((s) => s.refreshing);
  const fetchProfile = useCodexAccountStore((s) => s.fetchProfile);
  const fetchUsage = useCodexAccountStore((s) => s.fetchUsage);
  const refreshUsage = useCodexAccountStore((s) => s.refreshUsage);

  const codexTuiRunning = daemonStatus?.codexTuiRunning ?? false;
  const codexReady = daemonStatus?.codexBootstrapped ?? false;
  const claudeConnected = daemonStatus?.claudeConnected ?? false;

  // Fetch profile on mount, usage when codex connects
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);
  useEffect(() => {
    if (codexTuiRunning) fetchUsage();
  }, [codexTuiRunning, fetchUsage]);

  return (
    <div className="flex flex-1 flex-col gap-3 p-4 overflow-y-auto min-h-0">
      {/* Daemon connection */}
      <div className="flex items-center gap-2 pb-3 border-b border-border/50 relative">
        <h3 className="flex-1 m-0 text-sm font-semibold text-foreground">
          AgentBridge
        </h3>
        <StatusDot status={connected ? "connected" : "error"} variant="codex" />
        <span className="text-xs text-secondary-foreground">
          {connected ? "Online" : "Offline"}
        </span>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/20 to-transparent" />
      </div>

      <div className="flex flex-col gap-2">
        {/* Claude Code */}
        <ClaudePanel connected={claudeConnected} />

        {/* Codex */}
        <CodexPanel
          codexTuiRunning={codexTuiRunning}
          codexReady={codexReady}
          threadId={daemonStatus?.threadId ?? null}
          launchCodexTui={launchCodexTui}
          stopCodexTui={stopCodexTui}
          profile={profile}
          usage={usage}
          refreshing={refreshing}
          refreshUsage={refreshUsage}
          codexAccount={daemonStatus?.codexAccount}
        />

        {/* Other agents */}
        {Object.entries(agents)
          .filter(([key]) => key !== "claude" && key !== "codex")
          .map(([key, agent]) => (
            <div
              key={key}
              className="rounded-lg border border-input bg-card p-3 card-depth transition-all duration-300 hover:border-input/80"
            >
              <div className="flex items-center gap-2">
                <StatusDot status={agent.status} />
                <span className="flex-1 text-[13px] font-medium text-card-foreground">
                  {agent.displayName}
                </span>
                <span className="text-[11px] uppercase text-secondary-foreground">
                  {agent.status}
                </span>
              </div>
            </div>
          ))}
      </div>

      {/* Daemon info */}
      {daemonStatus && (
        <div className="mt-auto rounded-md bg-muted/60 p-2.5 border border-border/30 backdrop-blur-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Daemon
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            PID: {daemonStatus.pid}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            Queued: {daemonStatus.queuedMessageCount}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            Proxy: {daemonStatus.proxyUrl}
          </div>
        </div>
      )}
    </div>
  );
}
