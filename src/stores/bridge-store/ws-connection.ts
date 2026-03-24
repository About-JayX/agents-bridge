export const GUI_WS_URL = "ws://127.0.0.1:4503";
export const RECONNECT_INTERVAL = 3000;

export let ws: WebSocket | null = null;
export let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function setWs(socket: WebSocket | null) {
  ws = socket;
}

export function setReconnectTimer(timer: ReturnType<typeof setTimeout> | null) {
  reconnectTimer = timer;
}

export function sendWs(data: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
