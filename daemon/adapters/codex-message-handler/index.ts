import type {
  CodexAccountInfo,
  PendingRequest,
} from "../codex-adapter/codex-types";
import { TRACKED_REQUEST_METHODS } from "../codex-adapter/codex-types";
import type { MessageHandlerCallbacks } from "./types";
import { handleNotification } from "./notification-handler";
import { captureAccountData, captureTurnMetadata } from "./account-capture";

export type { CodexPhase, MessageHandlerCallbacks } from "./types";

/**
 * Handles Codex app-server notifications and response tracking.
 * Extracts agent messages, tracks thread/turn state, captures account info.
 */
export class CodexMessageHandler {
  private agentMessageBuffers = new Map<string, string[]>();
  private pendingRequests = new Map<string, PendingRequest>();
  private activeTurnIds = new Set<string>();
  private threadId: string | null = null;
  turnInProgress = false;

  accountInfo: CodexAccountInfo = { initialized: false, lastUpdated: 0 };

  constructor(
    private tuiConnIdFn: () => number,
    private cb: MessageHandlerCallbacks,
  ) {}

  get activeThreadId() {
    return this.threadId;
  }

  reset() {
    this.threadId = null;
    this.activeTurnIds.clear();
    this.turnInProgress = false;
    this.agentMessageBuffers.clear();
    this.pendingRequests.clear();
  }

  /** Process a message from the app-server (response or notification). */
  intercept(msg: any, connId?: number) {
    this.handleTrackedResponse(msg, connId);
    captureAccountData(msg, this.accountInfo, this.cb);
    if (msg.method) {
      handleNotification(msg, this.notificationState, this.cb);
      // Sync back turnInProgress from shared state object
      this.turnInProgress = this.notificationState.turnInProgress;
    }
  }

  /** Track an outgoing request so we can match its response. */
  trackRequest(message: any, connId: number) {
    const method = message?.method;
    const key = this.pendingKey(message?.id, connId);

    this.cb.log(
      `[track] method=${method} id=${message?.id} (type=${typeof message?.id}) key=${key}`,
    );

    if (!key || !TRACKED_REQUEST_METHODS.has(method)) return;

    const pending: PendingRequest = { method };
    if (method === "turn/start") {
      const threadId = message?.params?.threadId;
      if (typeof threadId === "string" && threadId.length > 0) {
        pending.threadId = threadId;
      }
    }

    if (this.pendingRequests.has(key)) {
      this.cb.log(`WARNING: overwriting pending request for key ${key}`);
    }
    this.pendingRequests.set(key, pending);
  }

  /** Clean up tracking state for a disconnected TUI connection. */
  cleanupConnection(connId: number) {
    const prefix = `${connId}:`;
    for (const key of this.pendingRequests.keys()) {
      if (key.startsWith(prefix)) this.pendingRequests.delete(key);
    }
  }

  setActiveThreadId(threadId: string, reason: string) {
    if (this.threadId === threadId) return;
    const prev = this.threadId;
    this.threadId = threadId;
    if (prev) {
      this.cb.log(`Active thread changed: ${prev} -> ${threadId} (${reason})`);
      return;
    }
    this.cb.log(`Thread detected: ${threadId} (${reason})`);
    this.cb.emitReady(threadId);
  }

  // ── Private ──────────────────────────────────────────────

  /** Shared state object passed to notification-handler functions. */
  private get notificationState() {
    return {
      agentMessageBuffers: this.agentMessageBuffers,
      activeTurnIds: this.activeTurnIds,
      turnInProgress: this.turnInProgress,
      accountInfo: this.accountInfo,
    };
  }

  private handleTrackedResponse(message: any, connId?: number) {
    const key = this.pendingKey(message?.id, connId);
    if (!key) return;

    const pending = this.pendingRequests.get(key);
    if (!pending) {
      if (message?.result?.thread?.id) {
        this.cb.log(
          `[track-resp] Unmatched response with thread.id=${message.result.thread.id}, key=${key}`,
        );
      }
      return;
    }

    this.pendingRequests.delete(key);

    if (message?.error) {
      this.cb.log(
        `Tracked request failed (${pending.method}, id ${key}): ${message.error.message ?? "unknown error"}`,
      );
      return;
    }

    switch (pending.method) {
      case "thread/start":
      case "thread/resume": {
        const threadId = message?.result?.thread?.id;
        if (typeof threadId === "string" && threadId.length > 0) {
          this.setActiveThreadId(threadId, `${pending.method} response ${key}`);
        }
        break;
      }
      case "turn/start":
        if (pending.threadId) {
          this.setActiveThreadId(
            pending.threadId,
            `turn/start response ${key}`,
          );
        }
        break;
    }
  }

  private pendingKey(rpcId: unknown, connId?: number): string | null {
    if (typeof rpcId !== "number" && typeof rpcId !== "string") return null;
    return `${connId ?? this.tuiConnIdFn()}:${rpcId}`;
  }
}
