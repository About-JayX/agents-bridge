import type { BridgeMessage } from "../../types";
import type { CodexAccountInfo } from "../codex-adapter/codex-types";

export type CodexPhase = "thinking" | "streaming" | "idle";

export interface MessageHandlerCallbacks {
  log: (msg: string) => void;
  emitAgentMessage: (msg: BridgeMessage) => void;
  emitAgentMessageStarted: (id: string) => void;
  emitAgentMessageDelta: (id: string, delta: string) => void;
  emitPhaseChanged: (phase: CodexPhase) => void;
  emitTurnCompleted: () => void;
  emitReady: (threadId: string) => void;
  emitAccountInfoUpdated: (info: CodexAccountInfo) => void;
}
