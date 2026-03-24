export function shortenPath(p: string): string {
  const idx = p.indexOf("/Users/");
  if (idx >= 0) {
    const rest = p.slice(idx + 7);
    const slash = rest.indexOf("/");
    return slash >= 0 ? `~${rest.slice(slash)}` : "~";
  }
  return p;
}

export function formatTimeLeft(resetsAt: number): string {
  const secs = Math.max(0, resetsAt - Date.now() / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function barColor(status: string) {
  return status === "allowed" ? "bg-claude" : "bg-destructive";
}
