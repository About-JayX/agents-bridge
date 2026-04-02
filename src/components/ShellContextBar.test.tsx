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
          return null;
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: {
        unregisterListener: () => {},
      },
    },
  });
}

describe("ShellContextBar", () => {
  test("renders a mobile inspector toggle when the shell exposes one", async () => {
    installTauriStub();
    const { ShellContextBar } = await import("./ShellContextBar");
    const html = renderToStaticMarkup(
      <ShellContextBar
        mobileInspectorOpen={false}
        onToggleMobileInspector={() => {}}
      />,
    );

    expect(html).toContain("Open inspector");
  });
});
