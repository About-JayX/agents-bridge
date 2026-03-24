import type { ServerWebSocket } from "bun";
import type { ControlClientMessage } from "../control-protocol";
import { state, broadcastToGui, type ControlSocketData } from "../daemon-state";
import type { ControlServerDeps } from "./types";
import { attachClaude, detachClaude } from "./claude-session";
import { sendStatus, sendProtocolMessage } from "./message-routing";

export function handleControlMessage(
  ws: ServerWebSocket<ControlSocketData>,
  raw: string | Buffer,
  deps: ControlServerDeps,
) {
  let message: ControlClientMessage;
  try {
    message = JSON.parse(typeof raw === "string" ? raw : raw.toString());
  } catch {
    return;
  }

  switch (message.type) {
    case "claude_connect":
      attachClaude(ws, deps);
      return;
    case "claude_disconnect":
      detachClaude(ws, "frontend requested disconnect", deps);
      return;
    case "status":
      sendStatus(ws, deps);
      return;
    case "fetch_messages": {
      const messages = state.flushBufferedMessages();
      sendProtocolMessage(ws, {
        type: "fetch_messages_result",
        requestId: message.requestId,
        messages,
      });
      return;
    }
    case "claude_to_codex": {
      if (message.message.source !== "claude") {
        sendProtocolMessage(ws, {
          type: "claude_to_codex_result",
          requestId: message.requestId,
          success: false,
          error: "Invalid message source",
        });
        return;
      }
      if (!deps.tuiState.canReply()) {
        sendProtocolMessage(ws, {
          type: "claude_to_codex_result",
          requestId: message.requestId,
          success: false,
          error: "Codex is not ready.",
        });
        return;
      }
      deps.log(
        `Forwarding Claude -> Codex (${message.message.content.length} chars)`,
      );
      const injected = deps.codex.injectMessage(message.message.content);
      broadcastToGui({
        type: "agent_message",
        payload: message.message,
        timestamp: Date.now(),
      });
      sendProtocolMessage(ws, {
        type: "claude_to_codex_result",
        requestId: message.requestId,
        success: injected,
        error: injected ? undefined : "Injection failed.",
      });
      return;
    }
  }
}
