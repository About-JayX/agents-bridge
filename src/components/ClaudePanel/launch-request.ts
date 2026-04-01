interface BuildClaudeLaunchRequestInput {
  claudeRole: string;
  cwd: string;
  model?: string | null;
  effort?: string | null;
  resumeSessionId?: string | null;
}

interface ClaudeLaunchRequest {
  roleId: string;
  cwd: string;
  model: string | null;
  effort: string | null;
  resumeSessionId: string | null;
}

function normalizeOptional(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildClaudeLaunchRequest(
  input: BuildClaudeLaunchRequestInput,
): ClaudeLaunchRequest {
  return {
    roleId: input.claudeRole,
    cwd: input.cwd,
    model: normalizeOptional(input.model),
    effort: normalizeOptional(input.effort),
    resumeSessionId: normalizeOptional(input.resumeSessionId),
  };
}
