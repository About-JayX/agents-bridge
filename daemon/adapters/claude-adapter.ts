import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EventEmitter } from "node:events";
import { appendFileSync } from "node:fs";
import { z } from "zod";
import type { BridgeMessage } from "../types";

export type ReplySender = (
  msg: BridgeMessage,
) => Promise<{ success: boolean; error?: string }>;
export type MessageFetcher = () => Promise<BridgeMessage[]>;
export type StatusFetcher = () => Promise<{
  bridgeReady: boolean;
  codexTuiRunning: boolean;
  threadId: string | null;
}>;

const LOG_FILE = "/tmp/agentbridge.log";

export class ClaudeAdapter extends EventEmitter {
  private server: McpServer;
  private replySender: ReplySender | null = null;
  private messageFetcher: MessageFetcher | null = null;
  private statusFetcher: StatusFetcher | null = null;

  constructor() {
    super();
    this.server = new McpServer({ name: "agentbridge", version: "0.1.0" });
    this.registerTools();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log("MCP server connected (tools: reply, check_messages, get_status)");
    this.emit("ready");
  }

  setReplySender(sender: ReplySender) {
    this.replySender = sender;
  }
  setMessageFetcher(fetcher: MessageFetcher) {
    this.messageFetcher = fetcher;
  }
  setStatusFetcher(fetcher: StatusFetcher) {
    this.statusFetcher = fetcher;
  }

  private registerTools() {
    this.server.registerTool(
      "reply",
      {
        description:
          "Send a message to Codex. Your reply will be injected into the Codex session as a new user turn.",
        inputSchema: {
          text: z.string().describe("The message to send to Codex."),
        },
      },
      async ({ text }) => {
        if (!this.replySender) {
          return {
            content: [{ type: "text", text: "Error: bridge not connected." }],
            isError: true,
          };
        }

        const msg: BridgeMessage = {
          id: `claude_${Date.now()}`,
          source: "claude",
          content: text,
          timestamp: Date.now(),
        };

        const result = await this.replySender(msg);
        if (!result.success) {
          this.log(`Reply failed: ${result.error}`);
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }

        return { content: [{ type: "text", text: "Message sent to Codex." }] };
      },
    );

    this.server.registerTool(
      "check_messages",
      {
        description:
          "Check for new messages from Codex. Returns any messages received since the last check. Call this after sending a reply to see Codex's response.",
      },
      async () => {
        if (!this.messageFetcher) {
          return {
            content: [
              { type: "text", text: "No new messages (bridge not connected)." },
            ],
          };
        }

        const messages = await this.messageFetcher();
        if (messages.length === 0) {
          return {
            content: [{ type: "text", text: "No new messages from Codex." }],
          };
        }

        const formatted = messages
          .map((m) => {
            const time = new Date(m.timestamp).toLocaleTimeString();
            return `[${time}] ${m.source}: ${m.content}`;
          })
          .join("\n\n---\n\n");

        this.log(`Returning ${messages.length} messages to Claude`);
        return {
          content: [
            {
              type: "text",
              text: `${messages.length} new message(s) from Codex:\n\n${formatted}`,
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "get_status",
      {
        description:
          "Get the current AgentBridge status: whether Codex is connected, the active thread ID, etc.",
      },
      async () => {
        if (!this.statusFetcher) {
          return { content: [{ type: "text", text: "Bridge not connected." }] };
        }

        const status = await this.statusFetcher();
        const lines = [
          `Codex connected: ${status.codexTuiRunning ? "yes" : "no"}`,
          `Bridge ready: ${status.bridgeReady ? "yes" : "no"}`,
          status.threadId ? `Thread: ${status.threadId}` : "No active thread",
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    );
  }

  private log(msg: string) {
    const line = `[${new Date().toISOString()}] [ClaudeAdapter] ${msg}\n`;
    process.stderr.write(line);
    try {
      appendFileSync(LOG_FILE, line);
    } catch {}
  }
}
