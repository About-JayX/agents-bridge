import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppBootstrapGate } from "../src/components/AppBootstrapGate";

describe("AppBootstrapGate", () => {
  test("renders a blocking loading state", () => {
    const html = renderToStaticMarkup(<AppBootstrapGate status="loading" />);

    expect(html).toContain("Preparing workspace session");
    expect(html).not.toContain("Choose your workspace");
  });

  test("renders a blocking error state", () => {
    const html = renderToStaticMarkup(
      <AppBootstrapGate
        status="error"
        message="Failed to clear active workspace session."
      />,
    );

    expect(html).toContain("Failed to clear active workspace session.");
    expect(html).not.toContain("Choose your workspace");
  });
});
