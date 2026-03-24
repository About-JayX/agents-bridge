import type { CodexAdapter } from "./adapters/codex-adapter";
import type { TuiConnectionState } from "./tui-connection-state";
import type { BridgeMessage } from "./types";
import type { GuiEvent } from "./daemon-state";
import type { state as DaemonState } from "./daemon-state";
import { ROLES } from "./role-config";

export interface CodexEventDeps {
  codex: CodexAdapter;
  tuiState: TuiConnectionState;
  broadcastToGui: (event: GuiEvent) => void;
  broadcastStatus: () => void;
  emitToClaude: (msg: BridgeMessage) => void;
  sendToClaudePty: (text: string) => boolean;
  state: typeof DaemonState;
  log: (msg: string) => void;
}

/**
 * Register all Codex EventEmitter handlers.
 * Extracted from daemon.ts to keep the entry point thin.
 */
export function registerCodexEvents(deps: CodexEventDeps): void {
  const {
    codex,
    tuiState,
    broadcastToGui,
    broadcastStatus,
    emitToClaude,
    sendToClaudePty,
    state,
    log,
  } = deps;

  // Buffer the last agentMessage per turn — only forward to Claude on turnCompleted
  let lastCodexMessage: BridgeMessage | null = null;

  codex.on("phaseChanged", (phase: string) => {
    broadcastToGui({
      type: "codex_phase",
      payload: { phase },
      timestamp: Date.now(),
    });
  });

  codex.on("agentMessageStarted", (id: string) => {
    broadcastToGui({
      type: "agent_message_started",
      payload: { id, source: "codex", content: "", timestamp: Date.now() },
      timestamp: Date.now(),
    });
  });

  codex.on("agentMessageDelta", (id: string, delta: string) => {
    broadcastToGui({
      type: "agent_message_delta",
      payload: { id, delta },
      timestamp: Date.now(),
    });
  });

  codex.on("agentMessage", (msg: BridgeMessage) => {
    if (msg.source !== "codex") return;
    log(
      `Codex agentMessage (${msg.content.length} chars) — buffered for turn end`,
    );
    lastCodexMessage = msg; // Overwrite: only the last one matters

    broadcastToGui({
      type: "agent_message",
      payload: msg,
      timestamp: Date.now(),
    });
  });

  codex.on("turnCompleted", () => {
    log("Codex turn completed");

    if (lastCodexMessage) {
      // Buffer for MCP check_messages (Claude pulls when ready)
      emitToClaude(lastCodexMessage);

      // Inject Codex output into Claude PTY
      // Short messages: inject full content directly
      // Long messages: inject truncated summary + pointer to check_messages
      const content = lastCodexMessage.content;
      const codexRole = ROLES[state.codexRole];
      const MAX_INJECT_LEN = 500;

      const replyReminder =
        "You MUST respond using the agentbridge reply tool so your response reaches the other agent.";
      let inject: string;
      if (content.length <= MAX_INJECT_LEN) {
        inject = `${codexRole.label} says: ${content}\n\n${replyReminder}`;
      } else {
        const summary = content.slice(0, MAX_INJECT_LEN).trimEnd();
        inject = `${codexRole.label} says: ${summary}... (truncated, use check_messages for full content)\n\n${replyReminder}`;
      }
      const injected = sendToClaudePty(inject);

      // Notify GUI
      broadcastToGui({
        type: "system_log",
        payload: {
          level: injected ? "info" : "warn",
          message: injected
            ? `Codex (${state.codexRole}) completed. ${content.length > MAX_INJECT_LEN ? "Summary" : "Full content"} injected to Claude.`
            : `Codex (${state.codexRole}) completed but no GUI client available — output not delivered to Claude.`,
        },
        timestamp: Date.now(),
      });

      lastCodexMessage = null;
    }
  });

  codex.on("ready", (threadId: string) => {
    tuiState.markBridgeReady();
    log(`Codex ready - thread ${threadId}. Bridge fully operational`);
    emitToClaude(
      state.systemMessage(
        "system_ready",
        `Codex TUI connected, session thread created (${threadId}). Bridge is fully operational.`,
      ),
    );
    broadcastToGui({
      type: "agent_status",
      payload: { agent: "codex", status: "connected", threadId },
      timestamp: Date.now(),
    });
  });

  codex.on("tuiConnected", (connId: number) => {
    tuiState.handleTuiConnected(connId);
    log(`Codex TUI connected (conn #${connId})`);
    broadcastStatus();
  });

  codex.on("tuiDisconnected", (connId: number) => {
    tuiState.handleTuiDisconnected(connId);
    log(`Codex TUI disconnected (conn #${connId})`);
    broadcastToGui({
      type: "agent_status",
      payload: { agent: "codex", status: "disconnected" },
      timestamp: Date.now(),
    });
    broadcastStatus();
  });

  codex.on("error", (err: Error) => {
    log(`Codex error: ${err.message}`);
    broadcastToGui({
      type: "agent_status",
      payload: { agent: "codex", status: "error", error: err.message },
      timestamp: Date.now(),
    });
  });

  codex.on("accountInfoUpdated", () => broadcastStatus());

  codex.on("exit", (code: number | null) => {
    log(`Codex process exited (code ${code})`);
    tuiState.handleCodexExit();
    emitToClaude(
      state.systemMessage(
        "system_codex_exit",
        `Codex app-server exited (code ${code ?? "unknown"}).`,
      ),
    );
    broadcastToGui({
      type: "agent_status",
      payload: { agent: "codex", status: "disconnected", exitCode: code },
      timestamp: Date.now(),
    });
    broadcastStatus();
  });
}
