import { useState, useCallback } from "react";
import type { Attachment } from "@/types";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function detectImage(fileName: string): {
  isImage: boolean;
  mediaType?: string;
} {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext))
    return { isImage: true, mediaType: MEDIA_TYPES[ext] };
  return { isImage: false };
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addFiles = useCallback((paths: string[]) => {
    setAttachments((prev) => [
      ...prev,
      ...paths.map((p) => {
        const fileName = fileNameFromPath(p);
        const { isImage, mediaType } = detectImage(fileName);
        return { filePath: p, fileName, isImage, mediaType };
      }),
    ]);
  }, []);

  const removeAt = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setAttachments([]), []);

  return { attachments, addFiles, removeAt, clear } as const;
}
