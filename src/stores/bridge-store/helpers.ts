import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { BridgeMessage, PermissionPrompt } from "@/types";
import type { BridgeState } from "./types";

// Tauri event payload shapes emitted by the Rust daemon (camelCase from serde)
interface AgentMessagePayload {
  payload: BridgeMessage;
  timestamp: number;
}
interface SystemLogPayload {
  level: string;
  message: string;
}
interface ClaudeTerminalDataPayload {
  data: string;
}
interface ClaudeTerminalStatusPayload {
  running: boolean;
  exitCode?: number;
  detail?: string;
}
interface AgentStatusPayload {
  agent: string;
  online: boolean;
  exitCode?: number;
}
interface PermissionPromptPayload extends PermissionPrompt {}
interface CodexStreamPayload {
  kind: "thinking" | "delta" | "message" | "turnDone";
  text?: string;
  status?: string;
}

export let _unlisteners: UnlistenFn[] = [];
export let _logId = 0;
export function nextLogId(): number {
  return ++_logId;
}
export function clearUnlisteners() {
  _unlisteners.forEach((fn) => fn());
  _unlisteners = [];
}
export function setUnlisteners(fns: UnlistenFn[]) {
  _unlisteners.forEach((fn) => fn());
  _unlisteners = fns;
}

export function initListeners(
  set: (fn: (s: BridgeState) => Partial<BridgeState>) => void,
) {
  Promise.all([
    listen<AgentMessagePayload>("agent_message", (e) => {
      set((s) => ({
        messages: [...s.messages.slice(-999), e.payload.payload],
      }));
    }),
    listen<SystemLogPayload>("system_log", (e) => {
      const { level, message } = e.payload;
      set((s) => ({
        terminalLines: [
          ...s.terminalLines.slice(-200),
          {
            id: nextLogId(),
            agent: "system",
            kind: level === "error" ? ("error" as const) : ("text" as const),
            line: message,
            timestamp: Date.now(),
          },
        ],
      }));
    }),
    listen<ClaudeTerminalDataPayload>("claude_terminal_data", (e) => {
      set((s) => ({
        claudeTerminalChunks: [
          ...s.claudeTerminalChunks.slice(-999),
          {
            id: nextLogId(),
            data: e.payload.data,
            timestamp: Date.now(),
          },
        ],
      }));
    }),
    listen("claude_terminal_reset", () => {
      set(() => ({
        claudeTerminalChunks: [],
        claudeTerminalExitCode: undefined,
        claudeTerminalDetail: undefined,
      }));
    }),
    listen<ClaudeTerminalStatusPayload>("claude_terminal_status", (e) => {
      set(() => ({
        claudeTerminalRunning: e.payload.running,
        claudeTerminalExitCode: e.payload.exitCode,
        claudeTerminalDetail: e.payload.detail,
      }));
    }),
    listen<AgentStatusPayload>("agent_status", (e) => {
      const { agent, online } = e.payload;
      set((s) => ({
        agents: {
          ...s.agents,
          [agent]: {
            ...s.agents[agent],
            name: agent,
            displayName: s.agents[agent]?.displayName ?? agent,
            status: online ? ("connected" as const) : ("disconnected" as const),
          },
        },
      }));
    }),
    listen("claude_terminal_attention", () => {
      set(() => ({ claudeNeedsAttention: true }));
    }),
    listen<CodexStreamPayload>("codex_stream", (e) => {
      const p = e.payload;
      set((s) => {
        switch (p.kind) {
          case "thinking":
            return {
              codexStream: {
                ...s.codexStream,
                thinking: true,
                currentDelta: "",
                turnStatus: "",
              },
            };
          case "delta": {
            const MAX_DELTA = 100_000;
            const next = s.codexStream.currentDelta + (p.text ?? "");
            return {
              codexStream: {
                ...s.codexStream,
                currentDelta:
                  next.length > MAX_DELTA ? next.slice(0, MAX_DELTA) : next,
              },
            };
          }
          case "message":
            // Turn might continue (tool calls, more reasoning). Keep thinking=true.
            // Only turnDone clears thinking.
            return {
              codexStream: {
                ...s.codexStream,
                lastMessage: p.text ?? "",
                currentDelta: "",
              },
            };
          case "turnDone":
            return {
              codexStream: {
                thinking: false,
                currentDelta: "",
                lastMessage: "",
                turnStatus: "",
              },
            };
          default:
            return {};
        }
      });
    }),
    listen<PermissionPromptPayload>("permission_prompt", (e) => {
      set((s) => ({
        permissionPrompts: [
          ...s.permissionPrompts.filter(
            (prompt) => prompt.requestId !== e.payload.requestId,
          ),
          e.payload,
        ],
      }));
    }),
  ]).then((fns) => {
    setUnlisteners(fns);
  });
}

export function logError(
  set: (fn: (s: BridgeState) => Partial<BridgeState>) => void,
) {
  return (e: unknown) =>
    set((s) => ({
      terminalLines: [
        ...s.terminalLines.slice(-200),
        {
          id: nextLogId(),
          agent: "system",
          kind: "error" as const,
          line: `[Error] ${String(e)}`,
          timestamp: Date.now(),
        },
      ],
    }));
}
