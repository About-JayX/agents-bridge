import type { EventEmitter } from "node:events";
import type { RoundResult } from "./types";

/**
 * Context passed from the Orchestrator class so mode functions
 * can read/write shared state without owning it.
 */
export interface ModeContext {
  agents: string[];
  maxRounds: number;
  currentRound: number;
  results: RoundResult[];
  pendingAgents: Set<string>;
  emitter: EventEmitter;
  /** Mutator — the Orchestrator bumps currentRound via this callback */
  setCurrentRound: (round: number) => void;
  setPendingAgents: (agents: Set<string>) => void;
  complete: () => void;
  log: (msg: string) => void;
}

// ── Parallel Mode ──────────────────────────────────────────

export function startParallel(ctx: ModeContext): void {
  ctx.setPendingAgents(new Set(ctx.agents));
  // Dispatch the same prompt to all agents simultaneously
  // The caller sets the prompt via the "dispatch" event handler
  for (const agent of ctx.agents) {
    ctx.emitter.emit("dispatch", { agent, phase: "parallel_execute" });
  }
}

// ── Sequential Mode ────────────────────────────────────────

export function startSequentialRound(ctx: ModeContext): void {
  const nextRound = ctx.currentRound + 1;
  ctx.setCurrentRound(nextRound);

  if (nextRound > ctx.maxRounds) {
    ctx.log(`Max rounds (${ctx.maxRounds}) reached, completing`);
    ctx.complete();
    return;
  }

  // Each round: agents speak one by one in order
  const agentIndex = (nextRound - 1) % ctx.agents.length;
  const agent = ctx.agents[agentIndex];
  ctx.setPendingAgents(new Set([agent]));

  ctx.log(`Sequential round ${nextRound}: dispatching to ${agent}`);
  ctx.emitter.emit("dispatch", {
    agent,
    phase: "sequential_round",
    round: nextRound,
    previousResults: ctx.results.slice(-ctx.agents.length),
  });
}

// ── Role Pipeline Mode ─────────────────────────────────────

export function startRolePipeline(ctx: ModeContext): void {
  // Role pipeline follows: Lead → Coder → Reviewer → Tester
  // Start with the first agent in the pipeline
  const agent = ctx.agents[0];
  if (!agent) {
    ctx.complete();
    return;
  }

  ctx.setPendingAgents(new Set([agent]));
  ctx.log(`Role pipeline: starting with ${agent}`);
  ctx.emitter.emit("dispatch", { agent, phase: "role_execute", step: 0 });
}

// ── Consensus Detection ────────────────────────────────────

/**
 * Simple consensus detection: check if the last N results are similar.
 * In practice, this would use semantic similarity — here we use a basic
 * length heuristic.
 */
export function checkConsensus(results: RoundResult[]): boolean {
  if (results.length < 2) return false;
  const recent = results.slice(-2);
  // Basic heuristic: if both recent results mention "agree" or "confirmed"
  const agreementTerms = [
    "agree",
    "confirmed",
    "approved",
    "lgtm",
    "looks good",
  ];
  return recent.every((r) =>
    agreementTerms.some((term) => r.content.toLowerCase().includes(term)),
  );
}

// ── Round Completion ───────────────────────────────────────

export function onRoundComplete(ctx: ModeContext, mode: string): void {
  ctx.emitter.emit("roundDone", {
    round: ctx.currentRound,
    results: ctx.results.slice(-ctx.agents.length),
  });

  switch (mode) {
    case "parallel":
      // All agents responded — waiting for Lead/user selection
      ctx.log("Parallel execution complete, waiting for selection");
      ctx.complete();
      break;

    case "sequential":
      // Check for consensus or continue
      if (checkConsensus(ctx.results)) {
        ctx.log("Consensus detected, completing");
        ctx.complete();
      } else {
        startSequentialRound(ctx);
      }
      break;

    case "role": {
      // Move to next agent in pipeline
      const lastAgent = ctx.results[ctx.results.length - 1]?.agent;
      const lastIdx = ctx.agents.indexOf(lastAgent ?? "");
      const nextIdx = lastIdx + 1;

      if (nextIdx >= ctx.agents.length) {
        ctx.log("Role pipeline complete");
        ctx.complete();
      } else {
        const nextAgent = ctx.agents[nextIdx];
        ctx.setPendingAgents(new Set([nextAgent]));
        ctx.log(`Role pipeline: advancing to ${nextAgent}`);
        ctx.emitter.emit("dispatch", {
          agent: nextAgent,
          phase: "role_execute",
          step: nextIdx,
          previousResult: ctx.results[ctx.results.length - 1],
        });
      }
      break;
    }
  }
}
