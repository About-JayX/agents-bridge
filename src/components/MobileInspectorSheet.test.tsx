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
    },
  });
}

describe("MobileInspectorSheet", () => {
  test("renders nothing while closed", async () => {
    installTauriStub();
    const { MobileInspectorSheet } = await import("./MobileInspectorSheet");
    expect(
      renderToStaticMarkup(
        <MobileInspectorSheet open={false} onClose={() => {}} />,
      ),
    ).toBe("");
  });

  test("renders provider controls and inspector content when opened", async () => {
    installTauriStub();
    const { MobileInspectorSheet } = await import("./MobileInspectorSheet");
    const html = renderToStaticMarkup(
      <MobileInspectorSheet open onClose={() => {}} />,
    );

    expect(html).toContain("Runtime control");
    expect(html).toContain("No active task");
    expect(html).toContain("Close inspector");
  });
});
