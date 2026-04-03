import { Paperclip, X } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Attachment } from "@/types";

interface AttachmentStripProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export function AttachmentStrip({
  attachments,
  onRemove,
}: AttachmentStripProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border/25 px-4 py-1.5">
      {attachments.map((att, i) => (
        <span
          key={`${att.filePath}-${i}`}
          className="group relative inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {att.isImage ? (
            <img
              src={convertFileSrc(att.filePath)}
              alt={att.fileName}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <Paperclip className="size-3 shrink-0" />
          )}
          <span className="max-w-[140px] truncate">{att.fileName}</span>
          <button
            onClick={() => onRemove(i)}
            className="ml-0.5 rounded-full radius-keep p-0.5 transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
