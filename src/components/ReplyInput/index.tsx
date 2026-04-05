import { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBridgeStore } from "@/stores/bridge-store";
import { selectAnyAgentConnected } from "@/stores/bridge-store/selectors";
import { useTaskStore } from "@/stores/task-store";
import {
  selectActiveTask,
  selectActiveTaskSessions,
} from "@/stores/task-store/selectors";
import { ReviewGateBadge } from "@/components/TaskPanel/ReviewGateBadge";
import { getReviewBadge } from "@/components/TaskPanel/view-model";
import { Send, Paperclip } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { hasMessagePayload } from "@/lib/message-payload";
import { TargetPicker, type Target } from "./TargetPicker";
import { AttachmentStrip } from "./AttachmentStrip";
import { createAsyncUnlistenCleanup } from "./async-unlisten";
import {
  REPLY_INPUT_HEIGHT_STORAGE_KEY,
  REPLY_INPUT_MIN_ROWS,
  getReplyInputHeightBounds,
  normalizeReplyInputMinHeight,
  resolveDraggedReplyInputMinHeight,
  resolveReplyInputHeight,
  type ReplyInputHeightBounds,
} from "./height";
import { getTaskSessionWarning } from "./task-session-guard";
import { useAttachments } from "./use-attachments";

function measureBaseTextareaHeight(el: HTMLTextAreaElement): number {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  return REPLY_INPUT_MIN_ROWS * lineHeight + paddingTop + paddingBottom;
}

export function ReplyInput() {
  const connected = useBridgeStore(selectAnyAgentConnected);
  const agents = useBridgeStore((s) => s.agents);
  const claudeRole = useBridgeStore((s) => s.claudeRole);
  const codexRole = useBridgeStore((s) => s.codexRole);
  const draft = useBridgeStore((s) => s.draft);
  const setDraft = useBridgeStore((s) => s.setDraft);
  const sendToCodex = useBridgeStore((s) => s.sendToCodex);
  const [target, setTarget] = useState<Target>("auto");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const minHeightRef = useRef<number | null>(null);
  const baseMinHeightRef = useRef<number | null>(null);
  const dragFrameRef = useRef(0);
  const activeTask = useTaskStore(selectActiveTask);
  const activeTaskSessions = useTaskStore(selectActiveTaskSessions);
  const reviewBadge = getReviewBadge(activeTask?.reviewStatus);
  const { attachments, addFiles, removeAt, clear } = useAttachments();
  const taskSessionWarning = getTaskSessionWarning({
    target,
    activeTask,
    sessions: activeTaskSessions,
    agents,
    claudeRole,
    codexRole,
  });
  const canSend =
    connected && !taskSessionWarning && hasMessagePayload(draft, attachments);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!hasMessagePayload(trimmed, attachments) || !canSend) return;
    sendToCodex(
      trimmed,
      target,
      attachments.length > 0 ? attachments : undefined,
    );
    setDraft("");
    clear();
  }, [attachments, canSend, clear, draft, sendToCodex, setDraft, target]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        composingRef.current ||
        e.nativeEvent.isComposing ||
        e.keyCode === 229
      )
        return;
      if (e.key === "Enter") {
        if (sendOnEnter) {
          if (e.shiftKey) return;
          e.preventDefault();
          handleSend();
        } else if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleSend, sendOnEnter],
  );

  const getHeightBounds = useCallback((): ReplyInputHeightBounds | null => {
    const el = textareaRef.current;
    if (!el) return null;
    if (baseMinHeightRef.current == null) {
      baseMinHeightRef.current = measureBaseTextareaHeight(el);
    }
    return getReplyInputHeightBounds(baseMinHeightRef.current, window.innerHeight);
  }, []);

  const persistMinHeight = useCallback((nextMinHeight: number) => {
    minHeightRef.current = nextMinHeight;
    try {
      localStorage.setItem(REPLY_INPUT_HEIGHT_STORAGE_KEY, String(nextMinHeight));
    } catch {}
  }, []);

  const syncTextareaHeight = useCallback(
    (requestedMinHeight?: number) => {
      const el = textareaRef.current;
      const bounds = getHeightBounds();
      if (!el || !bounds) return null;
      const nextMinHeight = Math.min(
        Math.max(requestedMinHeight ?? minHeightRef.current ?? bounds.min, bounds.min),
        bounds.max,
      );
      el.style.height = "auto";
      const { height, overflowY } = resolveReplyInputHeight(
        el.scrollHeight,
        nextMinHeight,
        bounds,
      );
      el.style.minHeight = `${bounds.min}px`;
      el.style.height = `${height}px`;
      el.style.overflowY = overflowY;
      return { bounds, nextMinHeight };
    },
    [getHeightBounds],
  );

  useEffect(() => {
    const bounds = getHeightBounds();
    if (!bounds) return;
    const persistedMinHeight = normalizeReplyInputMinHeight(
      (() => {
        try {
          return localStorage.getItem(REPLY_INPUT_HEIGHT_STORAGE_KEY);
        } catch {
          return null;
        }
      })(),
      bounds,
    );
    minHeightRef.current = persistedMinHeight;
    syncTextareaHeight(persistedMinHeight);
  }, [getHeightBounds, syncTextareaHeight]);

  useEffect(() => {
    syncTextareaHeight();
  }, [draft, syncTextareaHeight]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        baseMinHeightRef.current = null;
        const next = syncTextareaHeight();
        if (!next) return;
        if (next.nextMinHeight !== minHeightRef.current) {
          persistMinHeight(next.nextMinHeight);
        }
      }, 100);
    };
    window.addEventListener("resize", debounced);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", debounced);
    };
  }, [persistMinHeight, syncTextareaHeight]);

  const handlePickFiles = useCallback(async () => {
    const paths = await invoke<string[] | null>("pick_files");
    if (paths) addFiles(paths);
  }, [addFiles]);

  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  useEffect(() => {
    return createAsyncUnlistenCleanup(() =>
      getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "over") setDragOver(true);
        else if (event.payload.type === "drop") {
          setDragOver(false);
          if (event.payload.paths.length > 0)
            addFilesRef.current(event.payload.paths);
        } else setDragOver(false);
      }),
    );
  }, []);

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const bounds = getHeightBounds();
      if (!bounds) return;
      const startMinHeight = minHeightRef.current ?? bounds.min;
      const startY = event.clientY;

      const flushDragHeight = (nextMinHeight: number) => {
        if (dragFrameRef.current) return;
        dragFrameRef.current = requestAnimationFrame(() => {
          dragFrameRef.current = 0;
          syncTextareaHeight(nextMinHeight);
        });
      };

      const finish = (nextMinHeight: number) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        document.body.style.userSelect = "";
        if (dragFrameRef.current) {
          cancelAnimationFrame(dragFrameRef.current);
          dragFrameRef.current = 0;
        }
        const next = syncTextareaHeight(nextMinHeight);
        if (!next) return;
        persistMinHeight(next.nextMinHeight);
      };

      const onMove = (nextEvent: PointerEvent) => {
        const nextBounds = getHeightBounds();
        if (!nextBounds) return;
        const nextMinHeight = resolveDraggedReplyInputMinHeight(
          startMinHeight,
          startY,
          nextEvent.clientY,
          nextBounds,
        );
        flushDragHeight(nextMinHeight);
      };

      const onUp = (nextEvent: PointerEvent) => {
        const nextBounds = getHeightBounds();
        if (!nextBounds) return finish(startMinHeight);
        finish(
          resolveDraggedReplyInputMinHeight(
            startMinHeight,
            startY,
            nextEvent.clientY,
            nextBounds,
          ),
        );
      };

      const onCancel = () => {
        finish(startMinHeight);
      };

      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [getHeightBounds, persistMinHeight, syncTextareaHeight],
  );

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="relative px-4 py-3">
      <div
        className={`relative rounded-xl border bg-card/85 transition-colors focus-within:border-primary/35 focus-within:ring-1 focus-within:ring-primary/15 ${dragOver ? "border-primary/50 ring-2 ring-primary/20" : "border-border/50"}`}
      >
        <div
          data-reply-input-resize-handle="true"
          onPointerDown={handleResizePointerDown}
          className="group absolute left-1/2 top-0 z-10 flex h-3 w-14 -translate-x-1/2 touch-none items-start justify-center pt-1"
          title="Resize input"
          aria-label="Resize input"
        >
          <span
            data-reply-input-resize-grip="true"
            className="h-1 w-8 rounded-full bg-border/70 transition-colors group-hover:bg-muted-foreground/35 group-active:bg-primary/35"
          />
        </div>
        <textarea
          ref={textareaRef}
          className="block w-full min-h-[44px] resize-none bg-transparent px-5 py-3 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          placeholder="Describe the next step, ask for a review, or route a task to an agent."
          rows={REPLY_INPUT_MIN_ROWS}
        />

        <AttachmentStrip attachments={attachments} onRemove={removeAt} />

        <div className="flex items-center justify-between gap-2 border-t border-border/35 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <TargetPicker target={target} setTarget={setTarget} />
            <button
              onClick={handlePickFiles}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              title="Attach files"
            >
              <Paperclip className="size-3.5" />
            </button>
            {activeTask ? (
              <span className="truncate text-[10px] text-foreground/80">
                {activeTask.title}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/55">
                No active task
              </span>
            )}
            {activeTask && reviewBadge && (
              <ReviewGateBadge badge={reviewBadge} />
            )}
            {taskSessionWarning ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                {taskSessionWarning}
              </span>
            ) : !connected && (
              <span className="rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                Disconnected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSendOnEnter((v) => !v)}
              className="rounded-full border border-border/35 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={
                sendOnEnter
                  ? "Click to switch: ⌘+Enter to send"
                  : "Click to switch: Enter to send"
              }
            >
              {sendOnEnter ? "Enter ↵" : `${isMac ? "⌘" : "Ctrl"}+Enter`}
            </button>
            <Button
              size="sm"
              disabled={!canSend}
              onClick={handleSend}
              className="h-7 gap-1.5 rounded-full px-3 text-[11px]"
            >
              <Send className="size-3" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
