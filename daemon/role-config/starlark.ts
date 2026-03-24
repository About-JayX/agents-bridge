import type { RoleId } from "./types";

// ── Starlark Rules ──────────────────────────────────────────

const REVIEWER_COMMANDS = [
  { pattern: ["cat"], justification: "读取文件" },
  { pattern: ["grep"], justification: "搜索" },
  { pattern: ["find"], justification: "查找" },
  { pattern: ["git", "log"], justification: "历史" },
  { pattern: ["git", "diff"], justification: "差异" },
  { pattern: ["git", "show"], justification: "查看" },
  { pattern: ["ls"], justification: "列目录" },
  { pattern: ["head"], justification: "头部" },
  { pattern: ["tail"], justification: "尾部" },
  { pattern: ["wc"], justification: "统计" },
];

const TESTER_EXTRA_COMMANDS = [
  { pattern: ["pytest"], justification: "Python 测试" },
  { pattern: ["npm", "test"], justification: "npm 测试" },
  { pattern: ["npm", "run", "test"], justification: "npm 测试脚本" },
  { pattern: ["cargo", "test"], justification: "Rust 测试" },
  { pattern: ["bun", "test"], justification: "Bun 测试" },
  { pattern: ["vitest"], justification: "Vitest" },
  { pattern: ["jest"], justification: "Jest" },
];

/**
 * Generate Starlark prefix_rule whitelist for a role.
 * Returns null for roles that don't need Starlark rules (Lead, Coder).
 */
export function buildStarlarkRules(roleId: RoleId): string | null {
  if (roleId === "lead" || roleId === "coder") return null;

  const commands =
    roleId === "tester"
      ? [...REVIEWER_COMMANDS, ...TESTER_EXTRA_COMMANDS]
      : REVIEWER_COMMANDS;

  const rules = commands
    .map(
      (cmd) =>
        `prefix_rule(pattern = ${JSON.stringify(cmd.pattern)}, decision = "allow", justification = "${cmd.justification}")`,
    )
    .join("\n");

  return `# Auto-generated Starlark rules for role: ${roleId}\n# Only whitelisted commands are allowed\n${rules}\n`;
}
