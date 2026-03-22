import { create } from "zustand";
import type { GuiEvent, BridgeMessage, AgentInfo, DaemonStatus } from "@/types";

const GUI_WS_URL = "ws://127.0.0.1:4503";
const RECONNECT_INTERVAL = 3000;

interface BridgeState {
  connected: boolean;
  messages: BridgeMessage[];
  agents: Record<string, AgentInfo>;
  daemonStatus: DaemonStatus | null;

  sendToCodex: (content: string) => void;
  clearMessages: () => void;
  launchCodexTui: () => void;
  stopCodexTui: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function sendWs(data: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export const useBridgeStore = create<BridgeState>((set) => {
  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(GUI_WS_URL);

    socket.onopen = () => {
      set({ connected: true });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      let guiEvent: GuiEvent;
      try {
        guiEvent = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (guiEvent.type) {
        case "agent_message":
          set((s) => ({
            messages: [...s.messages, guiEvent.payload as BridgeMessage],
          }));
          break;

        case "agent_status": {
          const { agent, status, error, threadId } = guiEvent.payload;
          set((s) => ({
            agents: {
              ...s.agents,
              [agent]: {
                ...s.agents[agent],
                name: agent,
                displayName: s.agents[agent]?.displayName ?? agent,
                status,
                error,
                threadId,
              },
            },
          }));
          break;
        }

        case "daemon_status":
          set({ daemonStatus: guiEvent.payload as DaemonStatus });
          break;

        case "system_log":
          set((s) => ({
            messages: [
              ...s.messages,
              {
                id: `log_${Date.now()}`,
                source: "system" as const,
                content: guiEvent.payload.message,
                timestamp: guiEvent.timestamp,
              },
            ],
          }));
          break;
      }
    };

    socket.onclose = () => {
      set({ connected: false });
      ws = null;
      reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL);
    };

    socket.onerror = () => {
      socket.close();
    };

    ws = socket;
  }

  // Auto-connect on store creation
  connect();

  return {
    connected: false,
    messages: [],
    agents: {
      claude: {
        name: "claude",
        displayName: "Claude Code",
        status: "disconnected",
      },
      codex: { name: "codex", displayName: "Codex", status: "disconnected" },
    },
    daemonStatus: null,

    sendToCodex: (content) => sendWs({ type: "send_to_codex", content }),
    clearMessages: () => set({ messages: [] }),
    launchCodexTui: () => sendWs({ type: "launch_codex_tui" }),
    stopCodexTui: () => sendWs({ type: "stop_codex_tui" }),
  };
});
