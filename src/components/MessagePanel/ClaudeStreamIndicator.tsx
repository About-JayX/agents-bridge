import { useBridgeStore } from "@/stores/bridge-store";
import { stripEscapes } from "@/lib/strip-escapes";
import { SourceBadge } from "./SourceBadge";

export function ClaudeStreamIndicator() {
  const { thinking, previewText } = useBridgeStore((s) => s.claudeStream);

  if (!thinking && !previewText) return null;

  const cleanPreview = previewText ? stripEscapes(previewText).trim() : "";

  return (
    <div className="py-2">
      <div className="flex py-2.5 justify-start">
        <div className="max-w-[80%] rounded-xl px-3 py-2 bg-claude/10 border border-claude/30">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge source="claude" />
            <span className="text-[11px] text-claude animate-pulse">
              thinking…
            </span>
            <span className="text-[11px] text-muted-foreground">
              Live in Claude Terminal
            </span>
          </div>
          {cleanPreview && (
            <div className="text-[13px] text-foreground/80 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {cleanPreview}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
