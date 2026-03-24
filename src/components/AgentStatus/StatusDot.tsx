import { cn } from "@/lib/utils";

const statusDotColor: Record<string, string> = {
  connected: "bg-codex",
  connecting: "bg-yellow-500",
  disconnected: "bg-muted-foreground",
  error: "bg-destructive",
};

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        statusDotColor[status] ?? "bg-muted-foreground",
      )}
    />
  );
}
