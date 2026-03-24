import { state } from "../daemon-state";

/**
 * Send text to Claude PTY via GUI frontend -> Tauri invoke("pty_write").
 * PTY is managed by Rust (portable-pty), so daemon sends a WS event
 * to exactly ONE GUI client which writes to the Rust PTY.
 * Returns false if no GUI client is connected.
 */
export function sendToClaudePty(text: string) {
  const clients = state.guiClients;
  if (clients.size === 0) return false;

  const event = JSON.stringify({
    type: "pty_inject",
    payload: { data: text + "\r" },
    timestamp: Date.now(),
  });

  // Send to only the first connected client to avoid duplicate writes
  const firstClient = clients.values().next().value;
  if (firstClient) {
    try {
      firstClient.send(event);
    } catch {
      return false;
    }
  }
  return true;
}
