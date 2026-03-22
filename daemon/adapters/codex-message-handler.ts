import type { BridgeMessage, CodexItem } from "../types";
import type { CodexAccountInfo, PendingRequest } from "./codex-types";
import { TRACKED_REQUEST_METHODS } from "./codex-types";

export interface MessageHandlerCallbacks {
  log: (msg: string) => void;
  emitAgentMessage: (msg: BridgeMessage) => void;
  emitTurnCompleted: () => void;
  emitReady: (threadId: string) => void;
  emitAccountInfoUpdated: (info: CodexAccountInfo) => void;
}

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
    this.captureAccountData(msg);
    if (msg.method) this.handleNotification(msg);
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

  private handleNotification(msg: any) {
    const { method, params } = msg;
    switch (method) {
      case "turn/started":
        this.markTurnStarted(params?.turn?.id);
        this.captureTurnMetadata(params?.turn);
        break;
      case "item/started": {
        const item: CodexItem = params?.item;
        if (item?.type === "agentMessage")
          this.agentMessageBuffers.set(item.id, []);
        break;
      }
      case "item/agentMessage/delta": {
        const buf = this.agentMessageBuffers.get(params?.itemId);
        if (buf && params?.delta) buf.push(params.delta);
        break;
      }
      case "item/completed": {
        const item: CodexItem = params?.item;
        if (item?.type === "agentMessage") {
          const content = this.extractContent(item);
          this.agentMessageBuffers.delete(item.id);
          if (content) {
            this.cb.log(`Agent message completed (${content.length} chars)`);
            this.cb.emitAgentMessage({
              id: item.id,
              source: "codex" as const,
              content,
              timestamp: Date.now(),
            } satisfies BridgeMessage);
          }
        }
        break;
      }
      case "turn/completed":
        this.markTurnCompleted(params?.turn?.id);
        this.captureTurnMetadata(params?.turn);
        this.cb.emitTurnCompleted();
        break;
    }
  }

  private captureTurnMetadata(turn: any) {
    if (!turn) return;
    let changed = false;

    if (turn.model && turn.model !== this.accountInfo.model) {
      this.accountInfo.model = turn.model;
      changed = true;
    }

    if (turn.usage) {
      const u = turn.usage;
      this.accountInfo.usage = {
        inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
        outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
        totalTokens: u.total_tokens ?? u.totalTokens ?? 0,
      };
      // Accumulate across turns
      if (!this.accountInfo.cumulativeUsage) {
        this.accountInfo.cumulativeUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
      }
      this.accountInfo.cumulativeUsage.inputTokens +=
        this.accountInfo.usage.inputTokens;
      this.accountInfo.cumulativeUsage.outputTokens +=
        this.accountInfo.usage.outputTokens;
      this.accountInfo.cumulativeUsage.totalTokens +=
        this.accountInfo.usage.totalTokens;
      changed = true;
    }

    if (changed) {
      this.accountInfo.lastUpdated = Date.now();
      this.cb.log(
        `Turn metadata: model=${this.accountInfo.model ?? "?"}, usage=${JSON.stringify(this.accountInfo.usage ?? {})}`,
      );
      this.cb.emitAccountInfoUpdated(this.accountInfo);
    }
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

  private captureAccountData(msg: any) {
    const result = msg?.result;
    if (!result) return;

    let changed = false;

    if (result.userAgent || result.platformOs || result.platformFamily) {
      this.accountInfo.initialized = true;
      if (result.userAgent) this.accountInfo.userAgent = result.userAgent;
      if (result.platformOs) this.accountInfo.platformOs = result.platformOs;
      if (result.platformFamily)
        this.accountInfo.platformFamily = result.platformFamily;
      changed = true;
    }

    if (result.model && result.model !== this.accountInfo.model) {
      this.accountInfo.model = result.model;
      changed = true;
    }

    if (result.modelProvider) {
      this.accountInfo.modelProvider = result.modelProvider;
      changed = true;
    }

    if (result.serviceTier) {
      this.accountInfo.serviceTier = result.serviceTier;
      changed = true;
    }

    if (result.reasoningEffort) {
      this.accountInfo.reasoningEffort = result.reasoningEffort;
      changed = true;
    }

    if (result.cwd) {
      this.accountInfo.cwd = result.cwd;
      changed = true;
    }

    if (result.approvalPolicy) {
      this.accountInfo.approvalPolicy = result.approvalPolicy;
      changed = true;
    }

    if (result.sandbox != null) {
      this.accountInfo.sandbox =
        typeof result.sandbox === "string"
          ? result.sandbox
          : JSON.stringify(result.sandbox);
      changed = true;
    }

    if (changed) {
      this.accountInfo.lastUpdated = Date.now();
      this.cb.log(
        `Account info updated: model=${this.accountInfo.model ?? "?"}, provider=${this.accountInfo.modelProvider ?? "?"}`,
      );
      this.cb.emitAccountInfoUpdated(this.accountInfo);
    }
  }

  private extractContent(item: CodexItem): string {
    if (item.content?.length) {
      return item.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("");
    }
    return this.agentMessageBuffers.get(item.id)?.join("") ?? "";
  }

  private pendingKey(rpcId: unknown, connId?: number): string | null {
    if (typeof rpcId !== "number" && typeof rpcId !== "string") return null;
    return `${connId ?? this.tuiConnIdFn()}:${rpcId}`;
  }

  private markTurnStarted(turnId?: string) {
    this.activeTurnIds.add(
      typeof turnId === "string" && turnId.length > 0
        ? turnId
        : `unknown:${Date.now()}`,
    );
    this.turnInProgress = this.activeTurnIds.size > 0;
  }

  private markTurnCompleted(turnId?: string) {
    if (typeof turnId === "string" && turnId.length > 0) {
      this.activeTurnIds.delete(turnId);
    } else {
      this.activeTurnIds.clear();
    }
    this.turnInProgress = this.activeTurnIds.size > 0;
  }
}
