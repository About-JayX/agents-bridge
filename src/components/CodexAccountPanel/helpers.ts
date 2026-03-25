export function windowLabel(mins: number | null, fb: string): string {
  if (!mins) return fb;
  if (mins === 300) return "5h";
  if (mins === 10080) return "7d";
  return mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`;
}

export function barColor(used: number) {
  if (used >= 90) return "bg-destructive";
  if (used >= 75) return "bg-yellow-500";
  return "bg-codex";
}
