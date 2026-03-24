import type { ServerWebSocket } from "bun";
import type { ControlServerMessage } from "../control-protocol";
import type { BridgeMessage } from "../types";
import { state, type ControlSocketData } from "../daemon-state";
import type { ControlServerDeps } from "./types";

export function emitToClaude(message: BridgeMessage) {
  if (
    state.attachedClaude &&
    state.attachedClaude.readyState === WebSocket.OPEN
  ) {
    sendBridgeMessage(state.attachedClaude, message);
    return;
  }
  state.bufferMessage(message);
}

export function sendBridgeMessage(
  ws: ServerWebSocket<ControlSocketData>,
  message: BridgeMessage,
) {
  sendProtocolMessage(ws, { type: "codex_to_claude", message });
}

export function sendStatus(
  ws: ServerWebSocket<ControlSocketData>,
  deps: ControlServerDeps,
) {
  sendProtocolMessage(ws, { type: "status", status: deps.currentStatus() });
}

export function sendProtocolMessage(
  ws: ServerWebSocket<ControlSocketData>,
  message: ControlServerMessage,
) {
  try {
    ws.send(JSON.stringify(message));
  } catch {}
}
