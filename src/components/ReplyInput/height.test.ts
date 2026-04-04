import { describe, expect, test } from "bun:test";
import {
  REPLY_INPUT_MAX_HEIGHT,
  REPLY_INPUT_MIN_ROWS,
  REPLY_INPUT_HEIGHT_STORAGE_KEY,
  getReplyInputHeightBounds,
  normalizeReplyInputMinHeight,
  resolveDraggedReplyInputMinHeight,
  resolveReplyInputHeight,
} from "./height";

describe("ReplyInput height helpers", () => {
  test("uses a 3-row default minimum and stable storage key", () => {
    expect(REPLY_INPUT_MIN_ROWS).toBe(3);
    expect(REPLY_INPUT_HEIGHT_STORAGE_KEY).toBe("dimweave:reply-input-height");
  });

  test("limits maximum height to the smaller of viewport ratio and hard cap", () => {
    expect(getReplyInputHeightBounds(90, 600)).toEqual({ min: 90, max: 270 });
    expect(getReplyInputHeightBounds(90, 1200)).toEqual({
      min: 90,
      max: REPLY_INPUT_MAX_HEIGHT,
    });
  });

  test("normalizes persisted height into the allowed range", () => {
    const bounds = { min: 90, max: 270 };
    expect(normalizeReplyInputMinHeight(null, bounds)).toBe(90);
    expect(normalizeReplyInputMinHeight("not-a-number", bounds)).toBe(90);
    expect(normalizeReplyInputMinHeight("60", bounds)).toBe(90);
    expect(normalizeReplyInputMinHeight("180", bounds)).toBe(180);
    expect(normalizeReplyInputMinHeight("999", bounds)).toBe(270);
  });

  test("keeps autosize behavior while respecting persisted minimum and max cap", () => {
    const bounds = { min: 90, max: 270 };

    expect(resolveReplyInputHeight(120, 180, bounds)).toEqual({
      height: 180,
      overflowY: "hidden",
    });
    expect(resolveReplyInputHeight(240, 180, bounds)).toEqual({
      height: 240,
      overflowY: "hidden",
    });
    expect(resolveReplyInputHeight(320, 180, bounds)).toEqual({
      height: 270,
      overflowY: "auto",
    });
  });

  test("top-edge dragging upward increases height while downward drag reduces it", () => {
    const bounds = { min: 90, max: 270 };

    expect(resolveDraggedReplyInputMinHeight(180, 300, 260, bounds)).toBe(220);
    expect(resolveDraggedReplyInputMinHeight(180, 300, 340, bounds)).toBe(140);
    expect(resolveDraggedReplyInputMinHeight(180, 300, 500, bounds)).toBe(90);
  });
});
