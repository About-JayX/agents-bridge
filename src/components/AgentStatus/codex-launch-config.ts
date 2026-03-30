interface ReasoningModelLike {
  defaultReasoningLevel: string | null;
  reasoningLevels: { effort: string }[];
}

interface ConnectState {
  cwd: string;
  connecting: boolean;
  running: boolean;
}

interface CodexLaunchInputs {
  model?: string;
  reasoningEffort?: string;
  cwd?: string;
}

export function getDefaultReasoningEffort(
  model: ReasoningModelLike | undefined,
): string {
  if (!model) {
    return "";
  }
  return model.defaultReasoningLevel || model.reasoningLevels[0]?.effort || "";
}

export function canConnectCodex({
  cwd,
  connecting,
  running,
}: ConnectState): boolean {
  return cwd.trim().length > 0 && !connecting && !running;
}

export function buildCodexLaunchConfig({
  model,
  reasoningEffort,
  cwd,
}: CodexLaunchInputs): {
  model?: string;
  reasoningEffort?: string;
  cwd?: string;
} {
  return {
    model: model || undefined,
    reasoningEffort: reasoningEffort || undefined,
    cwd: cwd?.trim() || undefined,
  };
}
