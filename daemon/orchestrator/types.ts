export type OrchestratorMode =
  | "parallel" // 并行思考: same prompt to multiple AIs, Lead picks best
  | "sequential" // 顺序讨论: AIs speak in order, pass structured results
  | "role"; // 角色执行: Lead → Coder → Reviewer → Tester pipeline

export type OrchestratorState =
  | "idle"
  | "running"
  | "waiting_for_consensus"
  | "waiting_for_selection"
  | "completed";

export interface OrchestratorConfig {
  mode: OrchestratorMode;
  /** Maximum rounds for sequential discussion mode */
  maxRounds?: number;
  /** Agents participating in this orchestration */
  agents: string[];
}

export interface RoundResult {
  agent: string;
  content: string;
  timestamp: number;
}
