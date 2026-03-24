import type { ServerWebSocket } from "bun";
import { state, sendGuiEvent, type GuiSocketData } from "../daemon-state";
import type { GuiServerDeps } from "./types";
import { handleGuiMessage } from "./handlers";

export function startGuiServer(port: number, deps: GuiServerDeps) {
  const { currentStatus, log } = deps;

  state.guiServer = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      };

      if (req.method === "OPTIONS")
        return new Response(null, { headers: corsHeaders });
      if (url.pathname === "/healthz")
        return Response.json(
          { ok: true, pid: process.pid },
          { headers: corsHeaders },
        );
      if (url.pathname === "/status")
        return Response.json(currentStatus(), { headers: corsHeaders });
      if (server.upgrade(req, { data: { clientId: 0 } })) return undefined;
      return new Response("AgentBridge GUI Server", { headers: corsHeaders });
    },
    websocket: {
      open: (ws: ServerWebSocket<GuiSocketData>) => {
        ws.data.clientId = ++state.nextGuiClientId;
        state.guiClients.add(ws);
        log(`GUI client connected (#${ws.data.clientId})`);
        sendGuiEvent(ws, {
          type: "daemon_status",
          payload: currentStatus(),
          timestamp: Date.now(),
        });
      },
      close: (ws: ServerWebSocket<GuiSocketData>) => {
        state.guiClients.delete(ws);
        log(`GUI client disconnected (#${ws.data.clientId})`);
      },
      message: (ws: ServerWebSocket<GuiSocketData>, raw) => {
        handleGuiMessage(ws, raw, deps);
      },
    },
  });
}
