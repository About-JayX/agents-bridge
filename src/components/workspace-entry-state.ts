export type WorkspaceCandidate =
  | { type: "picked"; path: string }
  | { type: "recent"; path: string };

export function selectWorkspaceCandidate(
  next: WorkspaceCandidate,
  _current: WorkspaceCandidate | null,
): WorkspaceCandidate {
  return next;
}

export function loadRecentWorkspaces(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function pushRecentWorkspace(
  current: string[],
  nextPath: string,
  limit = 6,
): string[] {
  const trimmed = nextPath.trim();
  if (!trimmed) {
    return current;
  }

  return [trimmed, ...current.filter((item) => item !== trimmed)].slice(
    0,
    limit,
  );
}
