import { describe, expect, test } from "bun:test";
import { stripEscapes } from "../src/lib/strip-escapes";

describe("stripEscapes", () => {
  test("removes CSI sequences with letter final byte", () => {
    expect(stripEscapes("\x1b[31mhello\x1b[0m")).toBe("hello");
  });

  test("removes CSI sequences with tilde final byte (bracketed paste)", () => {
    // ESC[200~ and ESC[201~ are bracketed paste mode markers
    expect(stripEscapes("\x1b[200~pasted text\x1b[201~")).toBe("pasted text");
  });

  test("removes CSI sequences with @ final byte", () => {
    expect(stripEscapes("\x1b[4@inserted")).toBe("inserted");
  });

  test("removes OSC terminated by BEL", () => {
    expect(stripEscapes("\x1b]0;window title\x07real text")).toBe("real text");
  });

  test("removes OSC terminated by ST (ESC backslash)", () => {
    expect(stripEscapes("\x1b]0;window title\x1b\\real text")).toBe(
      "real text",
    );
  });

  test("removes standalone BEL and control chars", () => {
    expect(stripEscapes("hello\x07\x01\x02world")).toBe("helloworld");
  });

  test("preserves newlines, carriage returns, and tabs", () => {
    expect(stripEscapes("line1\nline2\r\ttab")).toBe("line1\nline2\r\ttab");
  });

  test("handles mixed escape sequences", () => {
    const input =
      "\x1b]0;title\x07\x1b[32mgreen\x1b[0m normal\x1b[200~paste\x1b[201~";
    expect(stripEscapes(input)).toBe("green normalpaste");
  });
});
