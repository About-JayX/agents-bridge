import type { CodexAccountInfo } from "../codex-adapter/codex-types";
import type { MessageHandlerCallbacks } from "./types";

/**
 * Capture model/usage metadata from turn started/completed notifications.
 */
export function captureTurnMetadata(
  turn: any,
  accountInfo: CodexAccountInfo,
  cb: MessageHandlerCallbacks,
): void {
  if (!turn) return;
  let changed = false;

  if (turn.model && turn.model !== accountInfo.model) {
    accountInfo.model = turn.model;
    changed = true;
  }

  if (turn.usage) {
    const u = turn.usage;
    accountInfo.usage = {
      inputTokens: u.input_tokens ?? u.inputTokens ?? 0,
      outputTokens: u.output_tokens ?? u.outputTokens ?? 0,
      totalTokens: u.total_tokens ?? u.totalTokens ?? 0,
    };
    // Accumulate across turns
    if (!accountInfo.cumulativeUsage) {
      accountInfo.cumulativeUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
    }
    accountInfo.cumulativeUsage.inputTokens += accountInfo.usage.inputTokens;
    accountInfo.cumulativeUsage.outputTokens += accountInfo.usage.outputTokens;
    accountInfo.cumulativeUsage.totalTokens += accountInfo.usage.totalTokens;
    changed = true;
  }

  if (changed) {
    accountInfo.lastUpdated = Date.now();
    cb.log(
      `Turn metadata: model=${accountInfo.model ?? "?"}, usage=${JSON.stringify(accountInfo.usage ?? {})}`,
    );
    cb.emitAccountInfoUpdated(accountInfo);
  }
}

/**
 * Capture platform/model/config info from RPC response results.
 */
export function captureAccountData(
  msg: any,
  accountInfo: CodexAccountInfo,
  cb: MessageHandlerCallbacks,
): void {
  const result = msg?.result;
  if (!result) return;

  let changed = false;

  if (result.userAgent || result.platformOs || result.platformFamily) {
    accountInfo.initialized = true;
    if (result.userAgent) accountInfo.userAgent = result.userAgent;
    if (result.platformOs) accountInfo.platformOs = result.platformOs;
    if (result.platformFamily)
      accountInfo.platformFamily = result.platformFamily;
    changed = true;
  }

  if (result.model && result.model !== accountInfo.model) {
    accountInfo.model = result.model;
    changed = true;
  }

  if (result.modelProvider) {
    accountInfo.modelProvider = result.modelProvider;
    changed = true;
  }

  if (result.serviceTier) {
    accountInfo.serviceTier = result.serviceTier;
    changed = true;
  }

  if (result.reasoningEffort) {
    accountInfo.reasoningEffort = result.reasoningEffort;
    changed = true;
  }

  if (result.cwd) {
    accountInfo.cwd = result.cwd;
    changed = true;
  }

  if (result.approvalPolicy) {
    accountInfo.approvalPolicy = result.approvalPolicy;
    changed = true;
  }

  if (result.sandbox != null) {
    accountInfo.sandbox =
      typeof result.sandbox === "string"
        ? result.sandbox
        : JSON.stringify(result.sandbox);
    changed = true;
  }

  if (changed) {
    accountInfo.lastUpdated = Date.now();
    cb.log(
      `Account info updated: model=${accountInfo.model ?? "?"}, provider=${accountInfo.modelProvider ?? "?"}`,
    );
    cb.emitAccountInfoUpdated(accountInfo);
  }
}
