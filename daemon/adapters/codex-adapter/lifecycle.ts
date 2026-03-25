import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { EventEmitter } from "node:events";
import type { AdapterState, CodexStartOptions } from "./types";
import { MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY_MS } from "./types";
import { ensurePortsFree } from "./codex-port-utils";
import { connectToAppServer } from "./app-server";
import { startProxy } from "./proxy";

export async function startCodex(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
  opts?: CodexStartOptions,
) {
  state.intentionalDisconnect = false;
  await ensurePortsFree([state.appPort, state.proxyPort], log);
  log(`Spawning codex app-server on ws://127.0.0.1:${state.appPort}`);

  const args = ["app-server", "--listen", `ws://127.0.0.1:${state.appPort}`];

  // --config CLI overrides (no config.toml needed)
  if (opts?.sandboxMode) {
    args.push("--config", `sandbox_mode="${opts.sandboxMode}"`);
  }
  if (opts?.approvalPolicy) {
    args.push("--config", `approval_policy="${opts.approvalPolicy}"`);
  }
  if (opts?.disableApplyPatch) {
    args.push("--config", "features.apply_patch_freeform=false");
  }

  // MCP is loaded from CODEX_HOME/config.toml (written by session-manager)

  // Build environment with optional CODEX_HOME isolation
  const env: Record<string, string> = { ...process.env } as any;
  if (opts?.codexHome) {
    env.CODEX_HOME = opts.codexHome;
    log(`Using isolated CODEX_HOME: ${opts.codexHome}`);
  }

  state.proc = spawn("codex", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });

  state.proc.on("error", (err) => emitter.emit("error", err));
  state.proc.on("exit", (code) => emitter.emit("exit", code));

  const stderrRl = createInterface({ input: state.proc.stderr! });
  stderrRl.on("line", (l) => log(`[codex-server] ${l}`));
  const stdoutRl = createInterface({ input: state.proc.stdout! });
  stdoutRl.on("line", (l) => log(`[codex-stdout] ${l}`));

  await waitForHealthy(state.appPort, log);
  await connectToAppServer(state, emitter, log);
  startProxy(state, emitter, log);
  log(`Proxy ready on ws://127.0.0.1:${state.proxyPort}`);
}

export function disconnectCodex(state: AdapterState) {
  state.intentionalDisconnect = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  state.appServerWs?.close();
  state.appServerWs = null;
  state.proxyServer?.stop();
  state.proxyServer = null;
  state.handler.reset();
}

export async function ensureConnected(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
): Promise<void> {
  if (state.appServerWs?.readyState === WebSocket.OPEN) {
    // App-server is connected; ensure proxy is also running
    if (!state.proxyServer) startProxy(state, emitter, log);
    return;
  }
  state.intentionalDisconnect = false;
  await connectToAppServer(state, emitter, log, true);
  // Restart proxy if it was closed by a previous disconnect()
  if (!state.proxyServer) {
    startProxy(state, emitter, log);
    log(`Proxy restarted on ws://127.0.0.1:${state.proxyPort}`);
  }
}

export function stopCodex(state: AdapterState) {
  state.intentionalDisconnect = true;
  disconnectCodex(state);
  if (state.proc) {
    const proc = state.proc;
    state.proc = null;
    proc.kill("SIGTERM");
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 2000);
    proc.on("exit", () => clearTimeout(killTimer));
  }
}

async function waitForHealthy(
  appPort: number,
  log: (msg: string) => void,
  maxRetries = 20,
  delayMs = 500,
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${appPort}/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Codex app-server failed to become healthy");
}

export function scheduleReconnect(
  state: AdapterState,
  emitter: EventEmitter,
  log: (msg: string) => void,
) {
  if (!state.proc) return;
  // Clear any existing reconnect timer to prevent double-scheduling
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log(
      `App-server reconnect failed after ${state.reconnectAttempts} attempts.`,
    );
    emitter.emit(
      "error",
      new Error("App-server connection lost and reconnect failed"),
    );
    return;
  }
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, state.reconnectAttempts),
    30000,
  );
  state.reconnectAttempts++;
  log(
    `Scheduling reconnect attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
  );
  state.reconnectTimer = setTimeout(async () => {
    try {
      await connectToAppServer(state, emitter, log, true);
    } catch {
      scheduleReconnect(state, emitter, log);
    }
  }, delay);
}
