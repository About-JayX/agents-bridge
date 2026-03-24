export interface TuiSocketData {
  connId: number;
}

export type TrackedRequestMethod =
  | "thread/start"
  | "thread/resume"
  | "turn/start";

export const TRACKED_REQUEST_METHODS = new Set<string>([
  "thread/start",
  "thread/resume",
  "turn/start",
]);

export interface PendingRequest {
  method: TrackedRequestMethod;
  threadId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Protocol-derived data from Codex app-server (NOT auth/usage — those live in Rust). */
export interface CodexAccountInfo {
  initialized: boolean;
  userAgent?: string;
  platformOs?: string;
  platformFamily?: string;
  model?: string;
  modelProvider?: string;
  serviceTier?: string;
  reasoningEffort?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: string;
  planType?: string;
  usage?: TokenUsage;
  cumulativeUsage?: TokenUsage;
  lastUpdated: number;
}

export interface IdMapping {
  connId: number;
  clientId: number | string;
}
