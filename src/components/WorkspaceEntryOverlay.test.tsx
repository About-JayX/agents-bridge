import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceCandidate } from "./workspace-entry-state";
import { WorkspaceEntryOverlay } from "./WorkspaceEntryOverlay";

function recent(path: string): WorkspaceCandidate {
  return { type: "recent", path };
}

describe("WorkspaceEntryOverlay", () => {
  test("renders title, chooser, and disabled continue state", () => {
    const html = renderToStaticMarkup(
      <WorkspaceEntryOverlay
        selected={null}
        recentWorkspaces={[]}
        actionError={null}
        onChooseFolder={() => {}}
        onSelectRecent={() => {}}
        onContinue={() => {}}
      />,
    );

    expect(html).toContain("Choose your workspace");
    expect(html).toContain("Choose folder...");
    expect(html).toContain("Continue");
    expect(html).toContain("disabled");
  });

  test("renders the selected candidate state", () => {
    const html = renderToStaticMarkup(
      <WorkspaceEntryOverlay
        selected={recent("/repo-a")}
        recentWorkspaces={["/repo-a"]}
        actionError={null}
        onChooseFolder={() => {}}
        onSelectRecent={() => {}}
        onContinue={() => {}}
      />,
    );

    expect(html).toContain("/repo-a");
    expect(html).toContain("data-workspace-selected=\"true\"");
  });
});
