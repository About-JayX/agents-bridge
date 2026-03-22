import type { ServerWebSocket } from "bun";
import type { CodexAdapter } from "./adapters/codex-adapter";
import type { TuiConnectionState } from "./tui-connection-state";
import type {
  ControlClientMessage,
  ControlServerMessage,
} from "./control-protocol";
import type { BridgeMessage } from "./types";
import { state, broadcastToGui, type ControlSocketData } from "./daemon-state";

interface ControlServerDeps {
  codex: CodexAdapter;
  tuiState: TuiConnectionState;
  currentStatus: () => any;
  broadcastStatus: () => void;
  log: (msg: string) => void;
  attachCmd: string;
}

export function startControlServer(port: number, deps: ControlServerDeps) {
  const { log } = deps;

  state.controlServer = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/healthz" || url.pathname === "/readyz") {
        return Response.json(deps.currentStatus());
      }
      if (
        url.pathname === "/ws" &&
        server.upgrade(req, { data: { clientId: 0, attached: false } })
      ) {
        return undefined;
      }
      return new Response("AgentBridge daemon");
    },
    websocket: {
      open: (ws: ServerWebSocket<ControlSocketData>) => {
        ws.data.clientId = ++state.nextControlClientId;
        log(`Frontend socket opened (#${ws.data.clientId})`);
      },
      close: (ws: ServerWebSocket<ControlSocketData>) => {
        log(`Frontend socket closed (#${ws.data.clientId})`);
        if (state.attachedClaude === ws)
          detachClaude(ws, "frontend socket closed", deps);
      },
      message: (ws: ServerWebSocket<ControlSocketData>, raw) => {
        handleControlMessage(ws, raw, deps);
      },
    },
  });
}

// ── Claude attach/detach ─────────────────────────────────

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

// ── Message routing ──────────────────────────────────────

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

function sendBridgeMessage(
  ws: ServerWebSocket<ControlSocketData>,
  message: BridgeMessage,
) {
  sendProtocolMessage(ws, { type: "codex_to_claude", message });
}

function sendStatus(
  ws: ServerWebSocket<ControlSocketData>,
  deps: ControlServerDeps,
) {
  sendProtocolMessage(ws, { type: "status", status: deps.currentStatus() });
}

function sendProtocolMessage(
  ws: ServerWebSocket<ControlSocketData>,
  message: ControlServerMessage,
) {
  try {
    ws.send(JSON.stringify(message));
  } catch {}
}

function handleControlMessage(
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
