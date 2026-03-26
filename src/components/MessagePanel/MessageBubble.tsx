import { MessageMarkdown } from "@/components/MessageMarkdown";
import { SourceBadge } from "./SourceBadge";
import type { BridgeMessage } from "@/types";

export function MessageBubble({ msg }: { msg: BridgeMessage }) {
  const isUser = msg.from === "user";
  return (
    <div
      className={`flex py-2.5 msg-enter ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-xl px-3 py-2 ${
          isUser
            ? "bg-sky-500/15 border border-sky-500/30"
            : "bg-card/60 border border-border/50"
        }`}
      >
        <div
          className={`flex items-center gap-2 mb-1 ${isUser ? "justify-end" : ""}`}
        >
          <SourceBadge source={msg.from} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <MessageMarkdown content={msg.content} />
      </div>
    </div>
  );
}
