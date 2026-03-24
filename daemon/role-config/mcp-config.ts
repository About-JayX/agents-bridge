/**
 * Build inline MCP config JSON for --strict-mcp-config --mcp-config <json>.
 * Zero file writes — the JSON is passed directly as a CLI argument.
 */
export function buildMcpConfigJson(controlPort = 4502): string {
  const bridgePath = new URL("../bridge.ts", import.meta.url).pathname;
  return JSON.stringify({
    mcpServers: {
      agentbridge: {
        command: "bun",
        args: ["run", bridgePath],
        env: { AGENTBRIDGE_CONTROL_PORT: String(controlPort) },
      },
    },
  });
}
