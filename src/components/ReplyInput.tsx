import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useBridgeStore } from "@/stores/bridge-store";

interface ReplyInputProps {
  disabled: boolean;
}

export function ReplyInput({ disabled }: ReplyInputProps) {
  const [text, setText] = useState("");
  const sendToCodex = useBridgeStore((s) => s.sendToCodex);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendToCodex(trimmed);
    setText("");
  }, [text, sendToCodex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t border-border">
      <textarea
        className="flex-1 resize-none rounded-md border border-input bg-card px-3 py-2 text-[13px] text-foreground font-[inherit] outline-none placeholder:text-muted-foreground focus:border-ring"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled
            ? "Connect daemon to send messages..."
            : "Send message to Codex (Enter to send)"
        }
        disabled={disabled}
        rows={2}
      />
      <Button disabled={disabled || !text.trim()} onClick={handleSend}>
        Send
      </Button>
    </div>
  );
}
