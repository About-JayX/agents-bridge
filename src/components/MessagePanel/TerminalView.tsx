import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface TerminalViewProps {
  visible: boolean;
}

export function TerminalView({ visible }: TerminalViewProps) {
  const xtermContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyBufferRef = useRef<string[]>([]);

  // Buffer PTY data immediately (before xterm is ready)
  useEffect(() => {
    const unlisten = listen<string>("pty-data", (event) => {
      if (xtermRef.current) {
        xtermRef.current.write(event.payload);
      } else {
        ptyBufferRef.current.push(event.payload);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Initialize xterm.js when terminal tab becomes visible
  useEffect(() => {
    if (!visible || !xtermContainerRef.current || xtermRef.current) {
      if (visible && xtermRef.current) {
        setTimeout(() => fitAddonRef.current?.fit(), 50);
      }
      return;
    }

    const term = new Terminal({
      theme: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        cursor: "#e5e5e5",
        selectionBackground: "#8b5cf644",
      },
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(xtermContainerRef.current);
    setTimeout(() => fitAddon.fit(), 100);

    // Keystrokes -> Rust PTY (direct invoke, no WS)
    term.onData((data) => {
      invoke("pty_write", { data }).catch(() => {});
    });
    term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { cols, rows }).catch(() => {});
    });

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Flush buffered PTY data
    for (const chunk of ptyBufferRef.current) {
      term.write(chunk);
    }
    ptyBufferRef.current = [];
  }, [visible]);

  // Handle resize (debounced)
  useEffect(() => {
    if (!fitAddonRef.current || !xtermContainerRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (visible) fitAddonRef.current?.fit();
      }, 100);
    });
    observer.observe(xtermContainerRef.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [visible]);

  return (
    <div
      ref={xtermContainerRef}
      className={cn("flex-1 min-h-0", !visible && "hidden")}
    />
  );
}
