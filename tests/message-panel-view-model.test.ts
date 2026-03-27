import { describe, expect, test } from "bun:test";
import {
  filterRenderableChatMessages,
  getClaudeAttentionResolution,
  getTransientIndicators,
} from "../src/components/MessagePanel/view-model";

describe("filterRenderableChatMessages", () => {
  test("drops system and whitespace-only messages", () => {
    const messages = [
      {
        id: "1",
        from: "system",
        to: "user",
        content: "system notice",
        timestamp: 1,
      },
      {
        id: "2",
        from: "claude",
        to: "user",
        content: "   \n\t",
        timestamp: 2,
      },
      {
        id: "3",
        from: "codex",
        to: "user",
        content: "visible",
        timestamp: 3,
      },
    ];

    expect(filterRenderableChatMessages(messages as any)).toEqual([
      messages[2],
    ]);
  });
});

describe("getTransientIndicators", () => {
  test("keeps Claude before Codex when both are active", () => {
    expect(
      getTransientIndicators(
        { thinking: true, previewText: "preview", lastUpdatedAt: 1 },
        {
          thinking: true,
          currentDelta: "delta",
          lastMessage: "",
          turnStatus: "",
        },
      ),
    ).toEqual(["claude", "codex"]);
  });

  test("omits inactive indicators", () => {
    expect(
      getTransientIndicators(
        { thinking: false, previewText: "", lastUpdatedAt: 0 },
        {
          thinking: false,
          currentDelta: "",
          lastMessage: "",
          turnStatus: "",
        },
      ),
    ).toEqual([]);
  });
});

describe("getClaudeAttentionResolution", () => {
  test("clears store attention while already on claude tab", () => {
    expect(getClaudeAttentionResolution("claude", true)).toEqual({
      nextTab: null,
      clearStoreAttention: true,
    });
  });

  test("switches to claude tab and clears store attention from other tabs", () => {
    expect(getClaudeAttentionResolution("messages", true)).toEqual({
      nextTab: "claude",
      clearStoreAttention: true,
    });
  });

  test("does nothing when there is no pending attention", () => {
    expect(getClaudeAttentionResolution("logs", false)).toEqual({
      nextTab: null,
      clearStoreAttention: false,
    });
  });
});
