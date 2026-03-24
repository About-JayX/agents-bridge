#!/usr/bin/env bun

/**
 * MCP register/unregister CLI entry.
 *
 * Usage:
 *   bun run daemon/mcp-register.ts register [--project-dir <path>]
 *   bun run daemon/mcp-register.ts unregister [--project-dir <path>]
 *
 * Writes to project-level `.mcp.json` (NOT `~/.claude/mcp.json`).
 * Equivalent to: claude mcp add --scope project agentbridge -- bun run <bridge_path>
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BRIDGE_PATH = fileURLToPath(new URL("./bridge.ts", import.meta.url));

function getProjectDir(): string {
  const idx = process.argv.indexOf("--project-dir");
  if (idx !== -1 && process.argv[idx + 1]) {
    return resolve(process.argv[idx + 1]);
  }
  return process.cwd();
}

function register(projectDir: string): void {
  const mcpPath = join(projectDir, ".mcp.json");

  let config: any = {};
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    } catch {
      config = {};
    }
  }

  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers.agentbridge = {
    command: "bun",
    args: ["run", BRIDGE_PATH],
  };

  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`Registered agentbridge MCP server in ${mcpPath}`);
}

function unregister(projectDir: string): void {
  const mcpPath = join(projectDir, ".mcp.json");

  if (!existsSync(mcpPath)) {
    console.log(`No .mcp.json found at ${mcpPath}, nothing to unregister.`);
    return;
  }

  let config: any;
  try {
    config = JSON.parse(readFileSync(mcpPath, "utf-8"));
  } catch {
    console.error(`Failed to parse ${mcpPath}`);
    process.exit(1);
  }

  if (config.mcpServers?.agentbridge) {
    delete config.mcpServers.agentbridge;

    // Clean up empty mcpServers object
    if (Object.keys(config.mcpServers).length === 0) {
      delete config.mcpServers;
    }

    // Clean up empty config
    if (Object.keys(config).length === 0) {
      const { unlinkSync } = require("node:fs");
      unlinkSync(mcpPath);
      console.log(`Removed empty ${mcpPath}`);
    } else {
      writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.log(`Unregistered agentbridge from ${mcpPath}`);
    }
  } else {
    console.log(`agentbridge not found in ${mcpPath}, nothing to unregister.`);
  }
}

// ── CLI entry ──────────────────────────────────────────────

const command = process.argv[2];
const projectDir = getProjectDir();

switch (command) {
  case "register":
    register(projectDir);
    break;
  case "unregister":
    unregister(projectDir);
    break;
  default:
    console.error(
      "Usage: mcp-register.ts <register|unregister> [--project-dir <path>]",
    );
    process.exit(1);
}
