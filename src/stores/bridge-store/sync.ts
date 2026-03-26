import { invoke } from "@tauri-apps/api/core";
import type { BridgeState } from "./types";
import { logError } from "./helpers";

interface AgentRuntimeStatusPayload {
  agent: string;
  online: boolean;
}
interface DaemonStatusSnapshotPayload {
  agents: AgentRuntimeStatusPayload[];
  claudeRole: string;
  codexRole: string;
}

export async function syncStatusSnapshot(
  set: (fn: (s: BridgeState) => Partial<BridgeState>) => void,
) {
  try {
    const snapshot = await invoke<DaemonStatusSnapshotPayload>(
      "daemon_get_status_snapshot",
    );
    set((s) => {
      const onlineAgents = new Set(
        snapshot.agents
          .filter((agent) => agent.online)
          .map((agent) => agent.agent),
      );
      const nextAgents = { ...s.agents };

      for (const [agent, info] of Object.entries(nextAgents)) {
        nextAgents[agent] = {
          ...info,
          name: agent,
          displayName: info.displayName ?? agent,
          status: onlineAgents.has(agent) ? "connected" : "disconnected",
        };
      }

      for (const { agent, online } of snapshot.agents) {
        nextAgents[agent] = {
          ...(nextAgents[agent] ?? {
            name: agent,
            displayName: agent,
          }),
          name: agent,
          displayName: nextAgents[agent]?.displayName ?? agent,
          status: online ? "connected" : "disconnected",
        };
      }

      return {
        agents: nextAgents,
        claudeRole: snapshot.claudeRole,
        codexRole: snapshot.codexRole,
      };
    });
  } catch (error) {
    logError(set)(error);
  }
}
