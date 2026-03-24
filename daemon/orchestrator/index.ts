import { EventEmitter } from "node:events";
import { appendFileSync } from "node:fs";
import type {
  OrchestratorMode,
  OrchestratorState,
  OrchestratorConfig,
  RoundResult,
} from "./types";
import {
  startParallel,
  startSequentialRound,
  startRolePipeline,
  onRoundComplete,
} from "./modes";
import type { ModeContext } from "./modes";

export type { OrchestratorMode, OrchestratorState, OrchestratorConfig };
export type { RoundResult } from "./types";

const LOG_FILE = "/tmp/agentbridge.log";

/**
 * Three-mode orchestration state machine.
 *
 * Events:
 *   "dispatch"   — send prompt to an agent { agent, prompt }
 *   "completed"  — orchestration finished { mode, results }
 *   "roundDone"  — one round completed (sequential mode) { round, results }
 */
export class Orchestrator extends EventEmitter {
  private mode: OrchestratorMode = "role";
  private state: OrchestratorState = "idle";
  private agents: string[] = [];
  private maxRounds = 5;
  private currentRound = 0;
  private results: RoundResult[] = [];
  private pendingAgents = new Set<string>();

  get currentMode(): OrchestratorMode {
    return this.mode;
  }

  get currentState(): OrchestratorState {
    return this.state;
  }

  /**
   * Start an orchestration session.
   */
  start(config: OrchestratorConfig): void {
    this.mode = config.mode;
    this.agents = config.agents;
    this.maxRounds = config.maxRounds ?? 5;
    this.currentRound = 0;
    this.results = [];
    this.state = "running";

    this.log(
      `Starting orchestration: mode=${this.mode}, agents=${this.agents.join(",")}`,
    );

    const ctx = this.buildModeContext();
    switch (this.mode) {
      case "parallel":
        startParallel(ctx);
        break;
      case "sequential":
        startSequentialRound(ctx);
        break;
      case "role":
        startRolePipeline(ctx);
        break;
    }
  }

  /**
   * Receive a result from an agent.
   */
  receiveResult(agent: string, content: string): void {
    if (this.state !== "running") return;

    this.results.push({ agent, content, timestamp: Date.now() });
    this.pendingAgents.delete(agent);
    this.log(
      `Received result from ${agent} (${content.length} chars), pending: ${this.pendingAgents.size}`,
    );

    if (this.pendingAgents.size === 0) {
      onRoundComplete(this.buildModeContext(), this.mode);
    }
  }

  /**
   * Cancel the current orchestration.
   */
  cancel(): void {
    this.log(`Orchestration cancelled (was ${this.state})`);
    this.state = "idle";
    this.pendingAgents.clear();
  }

  // ── Internal helpers ──────────────────────────────────────

  private buildModeContext(): ModeContext {
    return {
      agents: this.agents,
      maxRounds: this.maxRounds,
      currentRound: this.currentRound,
      results: this.results,
      pendingAgents: this.pendingAgents,
      emitter: this,
      setCurrentRound: (round: number) => {
        this.currentRound = round;
      },
      setPendingAgents: (agents: Set<string>) => {
        this.pendingAgents = agents;
      },
      complete: () => this.complete(),
      log: (msg: string) => this.log(msg),
    };
  }

  private complete(): void {
    this.state = "completed";
    this.emit("completed", {
      mode: this.mode,
      rounds: this.currentRound,
      results: this.results,
    });
    this.log(
      `Orchestration completed: mode=${this.mode}, rounds=${this.currentRound}, results=${this.results.length}`,
    );
  }

  private log(msg: string) {
    const line = `[${new Date().toISOString()}] [Orchestrator] ${msg}\n`;
    process.stderr.write(line);
    try {
      appendFileSync(LOG_FILE, line);
    } catch {}
  }
}
