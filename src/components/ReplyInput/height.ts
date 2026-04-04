export const REPLY_INPUT_HEIGHT_STORAGE_KEY = "dimweave:reply-input-height";
export const REPLY_INPUT_MIN_ROWS = 3;
export const REPLY_INPUT_MAX_HEIGHT = 420;
const REPLY_INPUT_MAX_VIEWPORT_RATIO = 0.45;

export interface ReplyInputHeightBounds {
  min: number;
  max: number;
}

function clampHeight(value: number, bounds: ReplyInputHeightBounds): number {
  if (!Number.isFinite(value)) {
    return bounds.min;
  }
  return Math.min(Math.max(Math.round(value), bounds.min), bounds.max);
}

export function getReplyInputHeightBounds(
  baseMinHeight: number,
  viewportHeight: number,
): ReplyInputHeightBounds {
  const min = Math.max(0, Math.round(baseMinHeight));
  return {
    min,
    max: Math.max(
      min,
      Math.min(
        REPLY_INPUT_MAX_HEIGHT,
        Math.round(viewportHeight * REPLY_INPUT_MAX_VIEWPORT_RATIO),
      ),
    ),
  };
}

export function normalizeReplyInputMinHeight(
  value: string | null,
  bounds: ReplyInputHeightBounds,
): number {
  return clampHeight(Number(value), bounds);
}

export function resolveReplyInputHeight(
  scrollHeight: number,
  minHeight: number,
  bounds: ReplyInputHeightBounds,
): {
  height: number;
  overflowY: "auto" | "hidden";
} {
  const height = clampHeight(Math.max(scrollHeight, minHeight), bounds);
  return {
    height,
    overflowY: scrollHeight > height ? "auto" : "hidden",
  };
}

export function resolveDraggedReplyInputMinHeight(
  startMinHeight: number,
  startPointerY: number,
  currentPointerY: number,
  bounds: ReplyInputHeightBounds,
): number {
  return clampHeight(
    startMinHeight + (startPointerY - currentPointerY),
    bounds,
  );
}
