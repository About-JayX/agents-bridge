import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellTopBar } from "./ShellTopBar";

describe("ShellTopBar", () => {
  test("renders product title and workspace", () => {
    const html = renderToStaticMarkup(
      <ShellTopBar
        workspaceLabel="~/Desktop/figma"
        surfaceMode="chat"
        logLineCount={0}
        errorCount={0}
        onClear={() => {}}
      />,
    );

    expect(html).toContain("Dimweave");
    expect(html).toContain("~/Desktop/figma");
  });
});
