import { broadcastToGui } from "../daemon-state";
import { ROLES, type RoleId } from "../role-config";
import { state as daemonState } from "../daemon-state";
import type { GuiServerDeps } from "./types";

/** Generation counter to handle rapid role changes — stale callbacks skip their broadcast. */
let codexRoleGeneration = 0;

function broadcastRoleSync() {
  broadcastToGui({
    type: "role_sync",
    payload: {
      claudeRole: daemonState.claudeRole,
      codexRole: daemonState.codexRole,
    },
    timestamp: Date.now(),
  });
}

export function handleSetRole(message: any, deps: GuiServerDeps) {
  const { codex, tuiState, broadcastStatus, log } = deps;
  const { agent, role } = message as {
    agent: "claude" | "codex";
    role: RoleId;
  };

  if (agent !== "claude" && agent !== "codex") return;
  if (!(role in ROLES)) return;

  if (agent === "claude") {
    daemonState.claudeRole = role;
    broadcastRoleSync();
    broadcastToGui({
      type: "system_log",
      payload: {
        level: "info",
        message: `Claude role changed to ${role}. Restart Claude PTY to apply.`,
      },
      timestamp: Date.now(),
    });
    log(`Claude role changed to ${role}`);
    return;
  }

  // agent === "codex"
  const oldRole = daemonState.codexRole;
  daemonState.codexRole = role;
  broadcastRoleSync();

  // If Codex has an active session, reconnect with new role config
  if (codex.activeThreadId) {
    const gen = ++codexRoleGeneration;
    const currentInfo = codex.accountInfo;
    codex.disconnect();
    tuiState.handleCodexExit();
    broadcastStatus();
    codex
      .ensureConnected()
      .then(() => {
        if (gen !== codexRoleGeneration) return { success: true };
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
        if (gen !== codexRoleGeneration) return;
        if (result.success) {
          tuiState.markBridgeReady();
          broadcastStatus();
          broadcastToGui({
            type: "system_log",
            payload: {
              level: "info",
              message: `Codex role changed to ${role}`,
            },
            timestamp: Date.now(),
          });
        } else {
          daemonState.codexRole = oldRole;
          broadcastRoleSync();
          broadcastToGui({
            type: "system_log",
            payload: {
              level: "error",
              message: `Codex role change failed: ${result.error}`,
            },
            timestamp: Date.now(),
          });
        }
      })
      .catch((err: any) => {
        if (gen !== codexRoleGeneration) return;
        const error = err instanceof Error ? err.message : String(err);
        log(`Codex role change reconnect failed: ${error}`);
        daemonState.codexRole = oldRole;
        broadcastRoleSync();
        broadcastToGui({
          type: "system_log",
          payload: {
            level: "error",
            message: `Codex role change failed: ${error}`,
          },
          timestamp: Date.now(),
        });
      });
  } else {
    broadcastToGui({
      type: "system_log",
      payload: { level: "info", message: `Codex role changed to ${role}` },
      timestamp: Date.now(),
    });
  }
  log(`Codex role change requested: → ${role}`);
}
