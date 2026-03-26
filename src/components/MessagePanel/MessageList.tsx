import { useRef, useState, useCallback } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useBridgeStore } from "@/stores/bridge-store";
import type { BridgeMessage } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { CodexStreamIndicator } from "./CodexStreamIndicator";

interface Props {
  messages: BridgeMessage[];
}

export function MessageList({ messages }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const { thinking, currentDelta } = useBridgeStore((s) => s.codexStream);
  const hasStream = thinking || !!currentDelta;

  const totalCount = messages.length + (hasStream ? 1 : 0);

  const handleAtBottomChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", behavior: "smooth" });
  }, []);

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
        itemContent={(index) => (
          <div className="px-4">
            {index < messages.length ? (
              <MessageBubble msg={messages[index]} />
            ) : (
              <CodexStreamIndicator />
            )}
          </div>
        )}
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
