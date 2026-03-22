/** Pure functions for patching problematic Codex app-server responses. */

export function patchResponse(
  parsed: any,
  raw: string,
  log: (msg: string) => void,
): string {
  if (!parsed.error || parsed.id === undefined) return raw;

  const errMsg: string = parsed.error.message ?? "";

  if (errMsg.includes("rate limits") || errMsg.includes("rateLimits")) {
    log(`Patching rateLimits error -> mock success (id: ${parsed.id})`);
    return JSON.stringify({
      id: parsed.id,
      result: {
        rateLimits: {
          limitId: null,
          limitName: null,
          primary: { usedPercent: 0, windowDurationMins: 60, resetsAt: null },
          secondary: null,
          credits: null,
          planType: null,
        },
        rateLimitsByLimitId: null,
      },
    });
  }

  if (errMsg.includes("Already initialized")) {
    log(`Patching "Already initialized" error (id: ${parsed.id})`);
    return JSON.stringify({
      id: parsed.id,
      result: {
        userAgent: "agent_bridge/0.1.0",
        platformFamily: "unix",
        platformOs: "macos",
      },
    });
  }

  return raw;
}
