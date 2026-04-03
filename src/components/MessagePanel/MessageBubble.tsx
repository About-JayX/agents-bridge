import { memo } from "react";
import { Paperclip } from "lucide-react";
import { MessageMarkdown } from "@/components/MessageMarkdown";
import { SourceBadge } from "./SourceBadge";
import type { BridgeMessage } from "@/types";
import { getMessageIdentityPresentation } from "./view-model";
import { getMessageSurfacePresentation } from "./surface-styles";

export function areMessageBubblePropsEqual(
  prev: { msg: BridgeMessage },
  next: { msg: BridgeMessage },
): boolean {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg.from === next.msg.from &&
    prev.msg.to === next.msg.to &&
    prev.msg.content === next.msg.content &&
    prev.msg.timestamp === next.msg.timestamp &&
    prev.msg.displaySource === next.msg.displaySource &&
    prev.msg.attachments?.length === next.msg.attachments?.length
  );
}

function MessageBubbleInner({ msg }: { msg: BridgeMessage }) {
  const isUser = msg.from === "user";
  const { badgeSource, roleLabel } = getMessageIdentityPresentation(msg);
  const surface = getMessageSurfacePresentation(badgeSource);
  return (
    <div
      className={`flex py-1.5 msg-enter ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[82%] rounded-xl px-3.5 py-2.5 ${surface.containerClass}`}
      >
        <div
          className={`flex items-center gap-1.5 mb-0.5 ${isUser ? "justify-end" : ""}`}
        >
          <SourceBadge source={badgeSource} />
          {roleLabel && (
            <span className="text-[10px] text-muted-foreground/50">
              {roleLabel}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/30">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <MessageMarkdown content={msg.content} />
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {msg.attachments.map((att, i) => (
              <span
                key={`${att.filePath}-${i}`}
                className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Paperclip className="size-3" />
                {att.fileName}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(
  MessageBubbleInner,
  areMessageBubblePropsEqual,
);
MessageBubble.displayName = "MessageBubble";
