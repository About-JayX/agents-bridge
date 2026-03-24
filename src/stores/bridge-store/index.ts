import { create } from "zustand";
import type { GuiEvent } from "@/types";
import type { BridgeState } from "./types";
import {
  GUI_WS_URL,
  RECONNECT_INTERVAL,
  ws,
  reconnectTimer,
  setWs,
  setReconnectTimer,
  sendWs,
} from "./ws-connection";
import { handleGuiEvent } from "./message-handler";

export type { CodexPhase, TerminalLine, BridgeState } from "./types";

export const useBridgeStore = create<BridgeState>((set, get) => {
  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(GUI_WS_URL);

    socket.onopen = () => {
      set({ connected: true });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        setReconnectTimer(null);
      }
    };

    socket.onmessage = (event) => {
      let guiEvent: GuiEvent;
      try {
        guiEvent = JSON.parse(event.data);
      } catch {
        return;
      }
      handleGuiEvent(guiEvent, set);
    };

    socket.onclose = () => {
      set({ connected: false });
      setWs(null);
      setReconnectTimer(setTimeout(connect, RECONNECT_INTERVAL));
    };

    socket.onerror = () => {
      socket.close();
    };

    setWs(socket);
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
    codexPhase: "idle" as const,
    terminalLines: [],
    claudeRateLimit: null,
    claudeRole: "lead",
    codexRole: "coder",
    draft: "",

    setDraft: (text) => set({ draft: text }),
    sendToCodex: (content) => sendWs({ type: "send_to_codex", content }),
    clearMessages: () => set({ messages: [] }),
    launchCodexTui: () => sendWs({ type: "launch_codex_tui" }),
    stopCodexTui: () => sendWs({ type: "stop_codex_tui" }),
    applyConfig: (config: {
      model?: string;
      reasoningEffort?: string;
      cwd?: string;
    }) => sendWs({ type: "apply_config", ...config }),
    setAgentRole: (agent, role) => {
      // Don't optimistically set role -- wait for daemon's role_sync event
      sendWs({ type: "set_agent_role", agent, role });
    },
  };
});
