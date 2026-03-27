import { type UnlistenFn } from "@tauri-apps/api/event";
import type { BridgeState } from "./types";
import { createBridgeListeners } from "./listener-setup";

export let _unlisteners: UnlistenFn[] = [];
export let _logId = 0;
export function nextLogId(): number {
  return ++_logId;
}
export function clearUnlisteners() {
  _unlisteners.forEach((fn) => fn());
  _unlisteners = [];
}
export function setUnlisteners(fns: UnlistenFn[]) {
  _unlisteners.forEach((fn) => fn());
  _unlisteners = fns;
}

export function initListeners(
  set: (fn: (s: BridgeState) => Partial<BridgeState>) => void,
) {
  createBridgeListeners(set, nextLogId).then((fns) => {
    setUnlisteners(fns);
  });
}

export function logError(
  set: (fn: (s: BridgeState) => Partial<BridgeState>) => void,
) {
  return (e: unknown) =>
    set((s) => ({
      terminalLines: [
        ...s.terminalLines.slice(-200),
        {
          id: nextLogId(),
          agent: "system",
          kind: "error" as const,
          line: `[Error] ${String(e)}`,
          timestamp: Date.now(),
        },
      ],
    }));
}
