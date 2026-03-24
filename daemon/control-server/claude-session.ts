import type { ServerWebSocket } from "bun";
import { state, broadcastToGui, type ControlSocketData } from "../daemon-state";
import type { ControlServerDeps } from "./types";
import { sendBridgeMessage, sendStatus } from "./message-routing";

export function attachClaude(
  ws: ServerWebSocket<ControlSocketData>,
  deps: ControlServerDeps,
) {
  const { codex, tuiState, log, attachCmd } = deps;

  if (state.attachedClaude && state.attachedClaude !== ws) {
    state.attachedClaude.close(4001, "replaced by a newer Claude session");
  }

  state.attachedClaude = ws;
  ws.data.attached = true;
  log(`Claude frontend attached (#${ws.data.clientId})`);
  broadcastToGui({
    type: "agent_status",
    payload: { agent: "claude", status: "connected" },
    timestamp: Date.now(),
  });

  sendStatus(ws, deps);

  if (state.bufferedMessages.length > 0) {
    for (const msg of state.flushBufferedMessages()) {
      sendBridgeMessage(ws, msg);
    }
  } else if (tuiState.canReply()) {
    sendBridgeMessage(
      ws,
      state.systemMessage(
        "system_ready",
        `Codex TUI connected, session thread created (${codex.activeThreadId}). Bridge is fully operational.`,
      ),
    );
  } else if (state.codexBootstrapped) {
    sendBridgeMessage(
      ws,
      state.systemMessage(
        "system_waiting",
        "AgentBridge started, waiting for Codex TUI to connect.",
      ),
    );
    sendBridgeMessage(ws, state.systemMessage("system_attach_cmd", attachCmd));
  }

  if (tuiState.canReply()) {
    codex.injectMessage(
      "AgentBridge connected to Claude Code. You can now communicate with Claude bidirectionally.",
    );
  }
}

export function detachClaude(
  ws: ServerWebSocket<ControlSocketData>,
  reason: string,
  deps: ControlServerDeps,
) {
  if (state.attachedClaude !== ws) return;
  state.attachedClaude = null;
  ws.data.attached = false;
  deps.log(`Claude frontend detached (#${ws.data.clientId}, ${reason})`);
  broadcastToGui({
    type: "agent_status",
    payload: { agent: "claude", status: "disconnected" },
    timestamp: Date.now(),
  });

  if (deps.tuiState.canReply()) {
    deps.codex.injectMessage(
      "Claude Code went offline. AgentBridge is still running.",
    );
  }
}
