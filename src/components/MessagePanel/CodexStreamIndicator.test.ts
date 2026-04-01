import { describe, expect, test } from "bun:test";
import type { CodexStreamState } from "@/stores/bridge-store/types";
import {
  getCodexStreamIndicatorViewModel,
  getTransientIndicators,
} from "./view-model";

function baseStream(): CodexStreamState {
  return {
    thinking: true,
    currentDelta: "",
    lastMessage: "",
    turnStatus: "",
    activity: "",
    reasoning: "",
    commandOutput: "",
  };
}

describe("getCodexStreamIndicatorViewModel", () => {
  test("activity-only state disables pulse and shows the activity label", () => {
    const viewModel = getCodexStreamIndicatorViewModel({
      ...baseStream(),
      thinking: false,
      activity: "Running: ls -la",
    });

    expect(viewModel.statusLabel).toBe("Running: ls -la");
    expect(viewModel.animatePulse).toBe(false);
    expect(viewModel.showStatusLabel).toBe(true);
  });

  test("reasoning content counts as visible content", () => {
    const viewModel = getCodexStreamIndicatorViewModel({
      ...baseStream(),
      reasoning: "Thinking through the file layout",
    });

    expect(viewModel.hasVisibleContent).toBe(true);
    expect(viewModel.animatePulse).toBe(false);
  });

  test("activity-only codex state still inserts a transient codex indicator", () => {
    const indicators = getTransientIndicators(
      {
        thinking: false,
        previewText: "",
        lastUpdatedAt: 0,
      },
      {
        ...baseStream(),
        thinking: false,
        activity: "Running: ls -la",
      },
    );

    expect(indicators).toEqual(["codex"]);
  });
});
