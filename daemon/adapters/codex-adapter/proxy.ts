import type { ServerWebSocket } from "bun";
import type { EventEmitter } from "node:events";
import type { TuiSocketData } from "./codex-types";
import type { AdapterState } from "./types";

export function startProxy(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
) {
  state.proxyServer = Bun.serve({
    port: state.proxyPort,
    hostname: "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/healthz" || url.pathname === "/readyz") {
        return fetch(`http://127.0.0.1:${state.appPort}${url.pathname}`);
      }
      if (server.upgrade(req, { data: { connId: 0 } })) return undefined;
      return new Response("AgentBridge Codex Proxy");
    },
    websocket: {
      open: (ws: ServerWebSocket<TuiSocketData>) =>
        onTuiConnect(state, emitter, log, ws),
      close: (ws: ServerWebSocket<TuiSocketData>) =>
        onTuiDisconnect(state, emitter, log, ws),
      message: (ws: ServerWebSocket<TuiSocketData>, msg) =>
        onTuiMessage(state, log, ws, msg),
    },
  });
}

function onTuiConnect(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
  ws: ServerWebSocket<TuiSocketData>,
) {
  state.tuiConnId++;
  ws.data.connId = state.tuiConnId;
  state.tuiWs = ws;
  log(`TUI connected (conn #${state.tuiConnId})`);
  emitter.emit("tuiConnected", state.tuiConnId);
}

function onTuiDisconnect(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
  ws: ServerWebSocket<TuiSocketData>,
) {
  const connId = ws.data.connId;
  if (state.tuiWs === ws) {
    state.tuiWs = null;
    log(`TUI disconnected (conn #${connId})`);
    emitter.emit("tuiDisconnected", connId);
  }
  state.handler.cleanupConnection(connId);
  for (const [upId, m] of state.upstreamToClient.entries()) {
    if (m.connId === connId) state.upstreamToClient.delete(upId);
  }
}

function onTuiMessage(
  state: AdapterState,
  log: (msg: string) => void,
  ws: ServerWebSocket<TuiSocketData>,
  msg: string | Buffer,
) {
  const data = typeof msg === "string" ? msg : msg.toString();
  const connId = ws.data.connId;

  if (connId !== state.tuiConnId) return;

  let forwarded = data;
  try {
    const parsed = JSON.parse(data);
    log(`TUI -> app-server: ${parsed.method ?? `response:${parsed.id}`}`);

    if (parsed.id !== undefined && parsed.method) {
      const proxyId = state.nextProxyId++;
      state.upstreamToClient.set(proxyId, { connId, clientId: parsed.id });
      state.handler.trackRequest(parsed, connId);
      parsed.id = proxyId;
      forwarded = JSON.stringify(parsed);
    } else {
      state.handler.trackRequest(parsed, connId);
    }
  } catch {}

  if (state.appServerWs?.readyState === WebSocket.OPEN) {
    state.appServerWs.send(forwarded);
  }
}
