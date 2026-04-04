import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

function installTauriStub() {
  let callbackId = 0;
  Object.assign(globalThis, {
    window: {
      __TAURI_INTERNALS__: {
        transformCallback: () => ++callbackId,
        unregisterCallback: () => {},
        invoke: async (cmd: string) => {
          if (cmd === "plugin:event|listen") return callbackId;
          if (cmd === "daemon_get_status_snapshot") {
            return { agents: [], claudeRole: "lead", codexRole: "coder" };
          }
          if (cmd === "daemon_get_task_snapshot") return null;
          return null;
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      innerHeight: 900,
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
  });
}

describe("ReplyInput", () => {
  test("renders a centered pill grip with a narrow trigger zone instead of a full-width strip", async () => {
    installTauriStub();
    const { ReplyInput } = await import("./index");

    const html = renderToStaticMarkup(<ReplyInput />);

    expect(html).toContain("data-reply-input-resize-handle=\"true\"");
    expect(html).toContain("absolute left-1/2 top-0");
    expect(html).toContain("data-reply-input-resize-grip=\"true\"");
    expect(html).toContain("w-14");
    expect(html).not.toContain("hover:bg-primary/25");
    expect(html).not.toContain("cursor-row-resize");
  });
});
