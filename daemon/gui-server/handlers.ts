import type { ServerWebSocket } from "bun";
import {
  sendGuiEvent,
  broadcastToGui,
  type GuiSocketData,
} from "../daemon-state";
import type { GuiServerDeps } from "./types";
import { handleLaunchCodexTui, handleApplyConfig } from "./codex-actions";
import { handleSetAgentRole } from "./role-actions";

/** Broadcast role change result (success or failure with revert) */
export function broadcastRoleChange(
  agent: string,
  role: string,
  level: "info" | "error",
  message: string,
) {
  broadcastToGui({
    type: "role_sync",
    payload: { agent, role },
    timestamp: Date.now(),
  });
  broadcastToGui({
    type: "system_log",
    payload: { level, message },
    timestamp: Date.now(),
  });
}

export function handleGuiMessage(
  ws: ServerWebSocket<GuiSocketData>,
  raw: string | Buffer,
  deps: GuiServerDeps,
) {
  const { codex, tuiState, currentStatus, broadcastStatus, log } = deps;
  let message: any;
  try {
    message = JSON.parse(typeof raw === "string" ? raw : raw.toString());
  } catch {
    return;
  }

  switch (message.type) {
    case "send_to_codex": {
      if (!tuiState.canReply()) {
        sendGuiEvent(ws, {
          type: "system_log",
          payload: { level: "error", message: "Codex is not ready." },
          timestamp: Date.now(),
        });
        return;
      }
      const injected = codex.injectMessage(message.content);
      if (injected) {
        broadcastToGui({
          type: "agent_message",
          payload: {
            id: `gui_${Date.now()}`,
            source: "claude",
            content: message.content,
            timestamp: Date.now(),
          },
          timestamp: Date.now(),
        });
      }
      return;
    }
    case "get_status":
      sendGuiEvent(ws, {
        type: "daemon_status",
        payload: currentStatus(),
        timestamp: Date.now(),
      });
      return;
    case "launch_codex_tui":
      handleLaunchCodexTui(ws, deps);
      return;
    case "apply_config":
      handleApplyConfig(message, deps);
      return;
    case "set_agent_role":
      handleSetAgentRole(message, deps);
      return;
    case "stop_codex_tui": {
      log("Disconnecting Codex from GUI...");
      codex.disconnect();
      tuiState.handleCodexExit();
      broadcastToGui({
        type: "agent_status",
        payload: { agent: "codex", status: "disconnected" },
        timestamp: Date.now(),
      });
      broadcastToGui({
        type: "system_log",
        payload: { level: "info", message: "Codex disconnected." },
        timestamp: Date.now(),
      });
      broadcastStatus();
      return;
    }
  }
}
