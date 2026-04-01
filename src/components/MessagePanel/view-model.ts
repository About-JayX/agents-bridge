import type { BridgeMessage } from "@/types";
import type {
  ClaudeStreamState,
  CodexStreamState,
} from "@/stores/bridge-store/types";

export type StreamIndicatorId = "claude" | "codex";
export type MessagePanelTab = "messages" | "claude" | "logs" | "approvals";

export interface CodexStreamIndicatorViewModel {
  visible: boolean;
  hasVisibleContent: boolean;
  animatePulse: boolean;
  showStatusLabel: boolean;
  statusLabel: string;
}

export function getMessageIdentityPresentation(
  message: BridgeMessage,
): {
  badgeSource: string;
  roleLabel: string | null;
} {
  const badgeSource = message.displaySource ?? message.from;
  const roleLabel =
    message.from !== badgeSource &&
    !["user", "system"].includes(message.from)
      ? message.from
      : null;
  return { badgeSource, roleLabel };
}

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
  const codexIndicator = getCodexStreamIndicatorViewModel(codexStream);
  return [
    ...(claudeStream.thinking ? (["claude"] as const) : []),
    ...(codexIndicator.visible
      ? (["codex"] as const)
      : []),
  ];
}

export function getCodexStreamIndicatorViewModel(
  codexStream: CodexStreamState,
): CodexStreamIndicatorViewModel {
  const hasVisibleContent = Boolean(
    codexStream.currentDelta ||
      codexStream.activity ||
      codexStream.reasoning ||
      codexStream.commandOutput,
  );
  const statusLabel = codexStream.currentDelta
    ? "streaming…"
    : codexStream.activity
      ? codexStream.activity
      : "thinking…";

  return {
    visible: codexStream.thinking || hasVisibleContent,
    hasVisibleContent,
    animatePulse: !hasVisibleContent,
    showStatusLabel: codexStream.thinking || Boolean(codexStream.activity),
    statusLabel,
  };
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

export function getClaudeTerminalPlaceholder(
  connected: boolean,
  running: boolean,
  chunkCount: number,
): string | null {
  if (chunkCount > 0) {
    return null;
  }
  if (running) {
    return "Claude terminal is starting. Waiting for output…";
  }
  if (connected) {
    return "Claude is connected. Waiting for terminal output…";
  }
  return "Claude terminal is idle. Connect Claude to start an embedded session.";
}
