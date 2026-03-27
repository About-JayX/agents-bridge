import { useRef, useState, useCallback, useEffect } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useBridgeStore } from "@/stores/bridge-store";
import type { BridgeMessage } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { CodexStreamIndicator } from "./CodexStreamIndicator";
import { ClaudeStreamIndicator } from "./ClaudeStreamIndicator";
import { getTransientIndicators } from "./view-model";

interface Props {
  messages: BridgeMessage[];
}

export function MessageList({ messages }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const didInitialScrollRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const codexStream = useBridgeStore((s) => s.codexStream);
  const claudeStream = useBridgeStore((s) => s.claudeStream);
  const indicators = getTransientIndicators(claudeStream, codexStream);

  const totalCount = messages.length + indicators.length;

  const handleAtBottomChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (totalCount === 0) {
      didInitialScrollRef.current = false;
      return;
    }
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [totalCount]);

  if (totalCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-[13px] text-muted-foreground animate-in fade-in duration-500">
          No messages yet. Connect Claude and Codex to start bridging.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative">
      <Virtuoso
        ref={virtuosoRef}
        totalCount={totalCount}
        atBottomStateChange={handleAtBottomChange}
        atBottomThreshold={80}
        followOutput="smooth"
        className="h-full"
        increaseViewportBy={200}
        itemContent={(index) => {
          const indicator = indicators[index - messages.length];
          return (
            <div className="px-4">
              {index < messages.length ? (
                <MessageBubble msg={messages[index]} />
              ) : indicator === "claude" ? (
                <ClaudeStreamIndicator />
              ) : (
                <CodexStreamIndicator />
              )}
            </div>
          );
        }}
      />
      {!atBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-[11px] bg-primary/90 text-primary-foreground shadow-lg hover:bg-primary transition-colors"
        >
          ↓ Back to bottom
        </button>
      )}
    </div>
  );
}
