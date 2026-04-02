import { useBridgeStore } from "@/stores/bridge-store";
import { SourceBadge } from "./SourceBadge";
import { MessageMarkdown } from "@/components/MessageMarkdown";
import { useEffect, useRef } from "react";

export function ClaudeStreamIndicator() {
  const thinking = useBridgeStore((s) => s.claudeStream.thinking);
  const previewText = useBridgeStore((s) => s.claudeStream.previewText);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [previewText]);

  if (!thinking) return null;

  return (
    <div className="py-2">
      <div className="flex py-2.5 justify-start">
        <div className="max-w-[80%] rounded-xl px-3 py-2 bg-claude/10 border border-claude/30">
          <div className="flex items-center gap-2 mb-1">
            <SourceBadge source="claude" />
            {!previewText && (
              <span className="text-[11px] text-claude animate-pulse">
                thinking…
              </span>
            )}
            {previewText && (
              <span className="text-[11px] text-muted-foreground">
                streaming…
              </span>
            )}
          </div>
          {previewText && (
            <div className="text-[13px] text-card-foreground leading-relaxed">
              <MessageMarkdown content={previewText} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
