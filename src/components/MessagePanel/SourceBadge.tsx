import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { MessageSource } from "@/types";

const sourceStyle: Record<string, { label: string; className: string }> = {
  claude: {
    label: "Claude",
    className:
      "border-claude/40 bg-claude/10 text-claude shadow-[0_0_8px_#8b5cf620]",
  },
  codex: {
    label: "Codex",
    className:
      "border-codex/40 bg-codex/10 text-codex shadow-[0_0_8px_#22c55e20]",
  },
  user: {
    label: "You",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_8px_#0ea5e920]",
  },
  system: {
    label: "System",
    className: "border-system/40 bg-system/10 text-system",
  },
};

export function SourceBadge({ source }: { source: MessageSource }) {
  const style = sourceStyle[source] ?? sourceStyle.system;
  return (
    <Badge variant="outline" className={cn("uppercase", style.className)}>
      {style.label}
    </Badge>
  );
}
