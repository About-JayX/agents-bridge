import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { RoleId } from "./types";
import { ROLES } from "./roles";

// ── User Instructions Merge ─────────────────────────────────

/**
 * Read-only scan of user project instruction files.
 * Priority: .jason/instructions.md > CLAUDE.md > AGENTS.md > .codex/AGENTS.md
 * Returns null if no instructions found.
 */
export function readUserInstructions(projectDir: string): string | null {
  const candidates = [
    join(projectDir, ".jason", "instructions.md"),
    join(projectDir, "CLAUDE.md"),
    join(projectDir, "AGENTS.md"),
    join(projectDir, ".codex", "AGENTS.md"),
  ];
  for (const f of candidates) {
    if (existsSync(f)) {
      try {
        return readFileSync(f, "utf-8");
      } catch {}
    }
  }
  return null;
}

/**
 * Merge user instructions into a role's Claude agent prompt.
 * Returns the merged prompt string (pure in-memory, no file writes).
 */
export function mergeUserInstructionsToPrompt(
  roleId: RoleId,
  projectDir: string,
): string {
  const role = ROLES[roleId];
  const basePrompt = role.claudeAgent.prompt;
  const userInstructions = readUserInstructions(projectDir);
  if (!userInstructions) return basePrompt;

  return `${basePrompt}\n\n## Project Instructions (from user)\n${userInstructions}`;
}
