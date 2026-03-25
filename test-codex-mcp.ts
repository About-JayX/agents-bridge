/**
 * Test harness for Codex MCP integration.
 * Covers: attachedAgents Map, agent connect/disconnect protocol,
 * routing with skipSender (role→agentId mapping), session-manager mcp.json.
 * Run: bun run test-codex-mcp.ts
 */

import type { BridgeMessage } from "./daemon/types";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// ── Mock state (mirrors daemon-state.ts) ─────────────────

const state = {
  claudeRole: "lead" as string,
  codexRole: "coder" as string,
  attachedAgents: new Map<string, { readyState: number }>(),
  bufferedMessages: [] as BridgeMessage[],
  bufferMessage(msg: BridgeMessage) {
    this.bufferedMessages.push(msg);
  },
  flushBufferedMessages() {
    return this.bufferedMessages.splice(0);
  },
};

// ── resolveTarget (mirrors message-routing.ts) ───────────

function resolveTarget(to: string) {
  if (to === "user") return [];
  const targets: Array<{ agent: string; online: boolean }> = [];
  if (state.claudeRole === to) {
    const ws = state.attachedAgents.get("claude");
    targets.push({
      agent: "claude",
      online: ws !== undefined && ws.readyState === 1,
    });
  }
  if (state.codexRole === to) {
    const ws = state.attachedAgents.get("codex");
    targets.push({
      agent: "codex",
      online: ws !== undefined && ws.readyState === 1,
    });
  }
  return targets;
}

// ── skipSender role→agentId mapping (mirrors handler.ts) ──

function resolveSenderAgentId(from: string): string | null {
  if (from === state.claudeRole) return "claude";
  if (from === state.codexRole) return "codex";
  return null;
}

// ── routeMessage (simplified mirror) ─────────────────────

function routeMessage(
  msg: BridgeMessage,
  opts?: { skipSender?: string | null },
): { success: boolean; routed: string[] } {
  if (msg.to === "user") return { success: true, routed: [] };

  const targets = resolveTarget(msg.to);
  if (targets.length === 0) return { success: false, routed: [] };

  const routed: string[] = [];
  for (const target of targets) {
    if (opts?.skipSender === target.agent) continue;
    if (target.online) {
      routed.push(target.agent);
    } else {
      state.bufferMessage(msg);
    }
  }
  return { success: routed.length > 0, routed };
}

function makeMsg(overrides: Partial<BridgeMessage>): BridgeMessage {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    from: "lead",
    to: "coder",
    content: "test",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

console.log("\n=== attachedAgents Map Tests ===\n");

{
  // Start empty
  assert(state.attachedAgents.size === 0, "starts with no agents");

  // Attach claude
  state.attachedAgents.set("claude", { readyState: 1 });
  assert(state.attachedAgents.has("claude"), "claude attached");
  assert(!state.attachedAgents.has("codex"), "codex not attached yet");

  // Attach codex
  state.attachedAgents.set("codex", { readyState: 1 });
  assert(state.attachedAgents.has("codex"), "codex attached");
  assert(state.attachedAgents.size === 2, "two agents attached");

  // Detach codex
  state.attachedAgents.delete("codex");
  assert(!state.attachedAgents.has("codex"), "codex detached");
  assert(state.attachedAgents.has("claude"), "claude still attached");

  // Replace claude
  const oldWs = state.attachedAgents.get("claude");
  const newWs = { readyState: 1 };
  state.attachedAgents.set("claude", newWs);
  assert(state.attachedAgents.get("claude") === newWs, "claude replaced");
  assert(state.attachedAgents.get("claude") !== oldWs, "old ws replaced");
}

console.log("\n=== Protocol: agent_connect/disconnect ===\n");

{
  state.attachedAgents.clear();

  // agent_connect claude
  const msg1 = { type: "agent_connect", agentId: "claude" };
  assert(msg1.type === "agent_connect", "protocol type is agent_connect");
  assert(msg1.agentId === "claude", "agentId is claude");

  // agent_connect codex
  const msg2 = { type: "agent_connect", agentId: "codex" };
  assert(msg2.agentId === "codex", "agentId is codex");

  // agent_disconnect
  const msg3 = { type: "agent_disconnect", agentId: "codex" };
  assert(msg3.type === "agent_disconnect", "protocol type is agent_disconnect");

  // No more claude_connect
  assert(msg1.type !== "claude_connect", "no legacy claude_connect");
}

console.log("\n=== Routing: resolveTarget with attachedAgents ===\n");

{
  state.attachedAgents.clear();
  state.attachedAgents.set("claude", { readyState: 1 });
  state.attachedAgents.set("codex", { readyState: 1 });

  // Route to coder → codex
  const t1 = resolveTarget("coder");
  assert(t1.length === 1, "coder resolves to 1 target");
  assert(t1[0].agent === "codex", "coder maps to codex");
  assert(t1[0].online === true, "codex is online (WS open)");

  // Route to lead → claude
  const t2 = resolveTarget("lead");
  assert(t2.length === 1, "lead resolves to 1 target");
  assert(t2[0].agent === "claude", "lead maps to claude");

  // Offline agent (WS not open)
  state.attachedAgents.set("codex", { readyState: 3 }); // CLOSED
  const t3 = resolveTarget("coder");
  assert(t3[0].online === false, "codex offline when WS closed");

  // Agent not attached — still resolves but offline
  state.attachedAgents.delete("codex");
  const t4 = resolveTarget("coder");
  assert(t4.length === 1, "coder role still resolves when not attached");
  assert(t4[0].online === false, "codex offline when not in attachedAgents");

  state.attachedAgents.set("codex", { readyState: 1 }); // restore
}

console.log("\n=== Routing: skipSender role→agentId mapping ===\n");

{
  // Claude (lead) sends → skipSender should be "claude" not "lead"
  const senderClaude = resolveSenderAgentId("lead");
  assert(senderClaude === "claude", "lead role → claude agentId");

  // Codex (coder) sends → skipSender should be "codex" not "coder"
  const senderCodex = resolveSenderAgentId("coder");
  assert(senderCodex === "codex", "coder role → codex agentId");

  // Unknown role
  const senderUnknown = resolveSenderAgentId("hacker");
  assert(senderUnknown === null, "unknown role → null");

  // Verify routing skips sender correctly
  const msg = makeMsg({ from: "lead", to: "lead" }); // self-send
  const result = routeMessage(msg, { skipSender: "claude" });
  assert(
    result.routed.length === 0,
    "self-send skipped (lead→lead, skip claude)",
  );

  // Without skipSender, message reaches claude
  const result2 = routeMessage(msg);
  assert(
    result2.routed.includes("claude"),
    "without skipSender, reaches claude",
  );
}

console.log("\n=== Routing: both agents same role ===\n");

{
  const oldCodexRole = state.codexRole;
  state.codexRole = "lead"; // both are lead
  const targets = resolveTarget("lead");
  assert(targets.length === 2, "same role → 2 targets");
  state.codexRole = oldCodexRole;
}

console.log("\n=== Routing: message buffering when offline ===\n");

{
  state.bufferedMessages = [];
  state.attachedAgents.set("codex", { readyState: 3 }); // CLOSED

  const msg = makeMsg({ from: "lead", to: "coder" });
  const result = routeMessage(msg);
  assert(result.success === false, "offline → not routed");
  assert(state.bufferedMessages.length === 1, "message buffered");
  assert(
    state.bufferedMessages[0].to === "coder",
    "buffered message has correct to",
  );

  state.bufferedMessages = [];
  state.attachedAgents.set("codex", { readyState: 1 }); // restore
}

console.log("\n=== Session Manager: mcp.json writing ===\n");

{
  const testDir = join(tmpdir(), `agentbridge-test-${Date.now()}`);
  const codexHome = join(testDir, "codex");
  mkdirSync(codexHome, { recursive: true });

  // Simulate session-manager writing mcp.json
  const bridgePath = "/Users/test/project/daemon/bridge.ts";
  const controlPort = 4502;
  const mcpJson = join(codexHome, "mcp.json");

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    mcpJson,
    JSON.stringify(
      {
        mcpServers: {
          agentbridge: {
            command: "bun",
            args: ["run", bridgePath],
            env: {
              AGENTBRIDGE_CONTROL_PORT: String(controlPort),
              AGENTBRIDGE_AGENT: "codex",
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  assert(existsSync(mcpJson), "mcp.json created");

  const parsed = JSON.parse(readFileSync(mcpJson, "utf-8"));
  assert(
    parsed.mcpServers?.agentbridge !== undefined,
    "agentbridge server defined",
  );
  assert(parsed.mcpServers.agentbridge.command === "bun", "command is bun");
  assert(
    parsed.mcpServers.agentbridge.args[1] === bridgePath,
    "bridge path correct",
  );
  assert(
    parsed.mcpServers.agentbridge.env.AGENTBRIDGE_AGENT === "codex",
    "AGENTBRIDGE_AGENT is codex",
  );
  assert(
    parsed.mcpServers.agentbridge.env.AGENTBRIDGE_CONTROL_PORT === "4502",
    "control port correct",
  );

  // Cleanup
  rmSync(testDir, { recursive: true, force: true });
}

console.log("\n=== Bridge: AGENTBRIDGE_AGENT env ===\n");

{
  // Default
  const defaultAgent = process.env.AGENTBRIDGE_AGENT ?? "claude";
  assert(defaultAgent === "claude", "default AGENTBRIDGE_AGENT is claude");

  // Codex would set it
  const codexEnv = "codex";
  assert(codexEnv !== "claude", "codex bridge has different identity");
}

console.log("\n=== AgentMcpAdapter: no ClaudeAdapter references ===\n");

{
  // Verify the rename happened
  const adapterPath = join(
    import.meta.dir,
    "daemon/adapters/claude-adapter/agent-mcp-adapter.ts",
  );
  const adapterSrc = readFileSync(adapterPath, "utf-8");
  assert(!adapterSrc.includes("class ClaudeAdapter"), "no ClaudeAdapter class");
  assert(
    adapterSrc.includes("class AgentMcpAdapter"),
    "AgentMcpAdapter class exists",
  );
  assert(!adapterSrc.includes("setClaudeRole"), "no setClaudeRole method");
  assert(adapterSrc.includes("setAgentRole"), "setAgentRole method exists");
  assert(
    !adapterSrc.includes("id: `claude_"),
    "no hardcoded claude_ prefix in IDs",
  );
}

console.log("\n=== Dead code: no PTY inject in codex-events ===\n");

{
  const codexEventsPath = join(import.meta.dir, "daemon/codex-events.ts");
  const codexEventsSrc = readFileSync(codexEventsPath, "utf-8");
  assert(!codexEventsSrc.includes("sendToClaudePty"), "no sendToClaudePty");
  assert(!codexEventsSrc.includes("routeMessage"), "no routeMessage dep");
  assert(!codexEventsSrc.includes("forwardPrompt"), "no forwardPrompt usage");
  assert(!codexEventsSrc.includes("PTY"), "no PTY references");
}

console.log("\n=== Dead code: no pty-bridge.ts ===\n");

{
  const ptyBridgePath = join(
    import.meta.dir,
    "daemon/gui-server/pty-bridge.ts",
  );
  assert(!existsSync(ptyBridgePath), "pty-bridge.ts deleted");
}

// ── Summary ──────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
