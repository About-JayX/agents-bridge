import { describe, expect, test } from "bun:test";
import { handleClaudeStreamEvent } from "../src/stores/bridge-store/listener-setup";

describe("handleClaudeStreamEvent", () => {
  test("ignores Claude preview payloads instead of storing preview text", () => {
    const state = {
      claudeStream: {
        thinking: true,
        previewText: "",
        lastUpdatedAt: 1,
      },
    } as any;

    expect(
      handleClaudeStreamEvent(state, {
        kind: "preview",
        text: "garbled preview",
      }),
    ).toEqual({});
  });
});
