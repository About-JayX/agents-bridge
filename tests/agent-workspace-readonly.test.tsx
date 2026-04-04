import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaudeConfigRows } from "../src/components/ClaudePanel/ClaudeConfigRows";
import { CodexConfigRows } from "../src/components/AgentStatus/CodexConfigRows";

describe("agent workspace config rows", () => {
  test("claude configuration rows no longer render project labels or paths", () => {
    const html = renderToStaticMarkup(
      <ClaudeConfigRows
        model=""
        effort=""
        disabled
        onModelChange={() => {}}
        onEffortChange={() => {}}
      />,
    );

    expect(html).not.toContain("Project");
    expect(html).not.toContain("Select project...");
    expect(html).not.toContain("/repo");
  });

  test("codex configuration rows no longer render project labels or paths", () => {
    const html = renderToStaticMarkup(
      <CodexConfigRows
        locked={false}
        profile={null}
        models={[]}
        selectedModel=""
        modelSelectOptions={[]}
        handleModelChange={() => {}}
        reasoningOptions={[]}
        selectedReasoning=""
        setSelectedReasoning={() => {}}
        reasoningSelectOptions={[]}
      />,
    );

    expect(html).not.toContain("Project");
    expect(html).not.toContain("Select project...");
    expect(html).not.toContain("/repo");
  });
});
