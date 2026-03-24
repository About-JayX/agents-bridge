import { broadcastToGui } from "../daemon-state";
import { ROLES, type RoleId } from "../role-config";
import { state as daemonState } from "../daemon-state";
import type { GuiServerDeps } from "./types";
import { broadcastRoleChange } from "./handlers";

export function handleSetAgentRole(message: any, deps: GuiServerDeps) {
  const { codex, tuiState, broadcastStatus, log } = deps;
  const { agent, role } = message as { agent: string; role: RoleId };
  const oldRole =
    agent === "codex" ? daemonState.codexRole : daemonState.claudeRole;

  if (agent === "claude") {
    daemonState.claudeRole = role;
    broadcastRoleChange(
      agent,
      role,
      "info",
      `Role changed: ${agent} → ${role}`,
    );
  } else if (agent === "codex") {
    daemonState.codexRole = role;
    if (codex.activeThreadId) {
      const currentInfo = codex.accountInfo;
      codex.disconnect();
      tuiState.handleCodexExit();
      broadcastStatus();
      codex
        .ensureConnected()
        .then(() => {
          const roleConfig = ROLES[role as keyof typeof ROLES];
          return codex.initSession({
            model: currentInfo.model,
            reasoningEffort: currentInfo.reasoningEffort,
            cwd: currentInfo.cwd,
            developerInstructions: roleConfig.developerInstructions,
            sandboxMode: roleConfig.sandboxMode,
            approvalPolicy: roleConfig.approvalPolicy,
          });
        })
        .then((result: { success: boolean; error?: string }) => {
          if (result.success) {
            tuiState.markBridgeReady();
            broadcastStatus();
            broadcastRoleChange(
              agent,
              role,
              "info",
              `Role changed: ${agent} → ${role}`,
            );
          } else {
            daemonState.codexRole = oldRole;
            broadcastRoleChange(
              agent,
              oldRole,
              "error",
              `Role change failed: ${result.error}`,
            );
          }
        })
        .catch((err: any) => {
          const error = err instanceof Error ? err.message : String(err);
          log(`Role change reconnect failed: ${error}`);
          daemonState.codexRole = oldRole;
          broadcastRoleChange(
            agent,
            oldRole,
            "error",
            `Role change reconnect failed: ${error}`,
          );
        });
    } else {
      broadcastRoleChange(
        agent,
        role,
        "info",
        `Role changed: ${agent} → ${role}`,
      );
    }
  }
  log(`Role change requested: ${agent} → ${role}`);
}
