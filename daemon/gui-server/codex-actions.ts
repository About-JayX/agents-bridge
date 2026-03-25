import type { ServerWebSocket } from "bun";
import {
  sendGuiEvent,
  broadcastToGui,
  state as daemonState,
  type GuiSocketData,
} from "../daemon-state";
import { ROLES } from "../role-config";
import type { GuiServerDeps } from "./types";

export function handleLaunchCodexTui(
  ws: ServerWebSocket<GuiSocketData>,
  deps: GuiServerDeps,
) {
  const { codex, tuiState, broadcastStatus, log } = deps;

  if (!daemonState.codexBootstrapped) {
    sendGuiEvent(ws, {
      type: "system_log",
      payload: {
        level: "error",
        message: "Codex app-server is not ready yet.",
      },
      timestamp: Date.now(),
    });
    return;
  }
  if (codex.activeThreadId) {
    sendGuiEvent(ws, {
      type: "system_log",
      payload: {
        level: "warn",
        message: "Codex session is already active.",
      },
      timestamp: Date.now(),
    });
    return;
  }
  log("Initializing Codex session from GUI...");
  broadcastToGui({
    type: "system_log",
    payload: { level: "info", message: "Connecting to Codex..." },
    timestamp: Date.now(),
  });

  const roleConf = ROLES[daemonState.codexRole];
  codex
    .initSession({
      developerInstructions: roleConf.developerInstructions,
      sandboxMode: roleConf.sandboxMode,
      approvalPolicy: roleConf.approvalPolicy,
    })
    .then((result: { success: boolean; error?: string }) => {
      if (result.success) {
        log("Codex session initialized successfully");
        tuiState.markBridgeReady();

        broadcastToGui({
          type: "agent_status",
          payload: {
            agent: "codex",
            status: "connected",
            threadId: codex.activeThreadId,
          },
          timestamp: Date.now(),
        });
        broadcastToGui({
          type: "system_log",
          payload: {
            level: "info",
            message: `Codex connected! Thread: ${codex.activeThreadId}`,
          },
          timestamp: Date.now(),
        });
        broadcastStatus();
      } else {
        log(`Codex session init failed: ${result.error}`);
        broadcastToGui({
          type: "system_log",
          payload: {
            level: "error",
            message: `Codex connection failed: ${result.error}`,
          },
          timestamp: Date.now(),
        });
      }
    })
    .catch((err: any) => {
      const error = err instanceof Error ? err.message : String(err);
      log(`Codex session init threw: ${error}`);
      broadcastToGui({
        type: "system_log",
        payload: {
          level: "error",
          message: `Codex connection failed: ${error}`,
        },
        timestamp: Date.now(),
      });
    })
    .finally(() => broadcastStatus());
}

export function handleApplyConfig(message: any, deps: GuiServerDeps) {
  const { codex, tuiState, broadcastStatus, log } = deps;

  // Merge incoming partial config with current session params to avoid losing values
  const currentInfo = codex.accountInfo;
  const model = message.model ?? currentInfo.model;
  const reasoningEffort =
    message.reasoningEffort ?? currentInfo.reasoningEffort;
  const cwd = message.cwd ?? currentInfo.cwd;
  log(
    `Applying config: model=${model ?? "-"}, reasoning=${reasoningEffort ?? "-"}, cwd=${cwd ?? "-"}`,
  );

  // Disconnect current session
  codex.disconnect();
  tuiState.handleCodexExit();
  broadcastToGui({
    type: "system_log",
    payload: { level: "info", message: "Reconnecting with new config..." },
    timestamp: Date.now(),
  });

  // Reconnect with new settings (merged with current values)
  codex
    .ensureConnected()
    .then(() => {
      const rc = ROLES[daemonState.codexRole];
      return codex.initSession({
        model,
        reasoningEffort,
        cwd,
        developerInstructions: rc.developerInstructions,
        sandboxMode: rc.sandboxMode,
        approvalPolicy: rc.approvalPolicy,
      });
    })
    .then((result: { success: boolean; error?: string }) => {
      if (result.success) {
        tuiState.markBridgeReady();
        broadcastToGui({
          type: "agent_status",
          payload: {
            agent: "codex",
            status: "connected",
            threadId: codex.activeThreadId,
          },
          timestamp: Date.now(),
        });
        broadcastToGui({
          type: "system_log",
          payload: {
            level: "info",
            message: `Config applied! Model: ${model ?? "default"}`,
          },
          timestamp: Date.now(),
        });
        broadcastStatus();
      } else {
        broadcastToGui({
          type: "system_log",
          payload: {
            level: "error",
            message: `Config apply failed: ${result.error}`,
          },
          timestamp: Date.now(),
        });
      }
    })
    .catch((err: any) => {
      const error = err instanceof Error ? err.message : String(err);
      log(`Config apply threw: ${error}`);
      broadcastToGui({
        type: "system_log",
        payload: {
          level: "error",
          message: `Config apply failed: ${error}`,
        },
        timestamp: Date.now(),
      });
    })
    .finally(() => broadcastStatus());
}
