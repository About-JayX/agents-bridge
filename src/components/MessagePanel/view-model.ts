import type { BridgeMessage } from "@/types";
import type {
  ClaudeStreamState,
  CodexStreamState,
} from "@/stores/bridge-store/types";

export type StreamIndicatorId = "claude" | "codex";
export type MessagePanelTab = "messages" | "claude" | "logs" | "approvals";

export function filterRenderableChatMessages(
  messages: BridgeMessage[],
): BridgeMessage[] {
  return messages.filter(
    (message) =>
      message.from !== "system" && message.content.trim().length > 0,
  );
}

export function getTransientIndicators(
  claudeStream: ClaudeStreamState,
  codexStream: CodexStreamState,
): StreamIndicatorId[] {
  return [
    ...(claudeStream.thinking || !!claudeStream.previewText
      ? (["claude"] as const)
      : []),
    ...(codexStream.thinking || !!codexStream.currentDelta
      ? (["codex"] as const)
      : []),
  ];
}

export function getClaudeAttentionResolution(
  tab: MessagePanelTab,
  needsAttention: boolean,
): {
  nextTab: MessagePanelTab | null;
  clearStoreAttention: boolean;
} {
  if (!needsAttention) {
    return {
      nextTab: null,
      clearStoreAttention: false,
    };
  }

  if (tab === "claude") {
    return {
      nextTab: null,
      clearStoreAttention: true,
    };
  }

  return {
    nextTab: "claude",
    clearStoreAttention: true,
  };
}
