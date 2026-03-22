import { execSync } from "node:child_process";

/** Check and clean up ports, killing stale codex app-server processes. */
export async function ensurePortsFree(
  ports: number[],
  log: (msg: string) => void,
): Promise<void> {
  for (const port of ports) {
    try {
      const pids = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
      if (!pids) continue;

      const pidList = pids
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      const staleCodexPids: string[] = [];
      const foreignPids: string[] = [];

      for (const pid of pidList) {
        try {
          const cmdline = execSync(`ps -p ${pid} -o args=`, {
            encoding: "utf-8",
          }).trim();
          if (cmdline.includes("codex") && cmdline.includes("app-server")) {
            staleCodexPids.push(pid);
          } else {
            foreignPids.push(pid);
          }
        } catch {}
      }

      if (staleCodexPids.length > 0) {
        log(
          `Cleaning up stale codex app-server on port ${port}: PID(s) ${staleCodexPids.join(", ")}`,
        );
        for (const pid of staleCodexPids) {
          try {
            execSync(`kill ${pid}`, { encoding: "utf-8" });
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (foreignPids.length > 0) {
        throw new Error(
          `Port ${port} is already in use by non-Codex process(es): PID(s) ${foreignPids.join(", ")}.`,
        );
      }

      try {
        const remaining = execSync(`lsof -ti :${port}`, {
          encoding: "utf-8",
        }).trim();
        if (remaining)
          throw new Error(`Port ${port} is still occupied after cleanup.`);
      } catch (err: any) {
        if (err.message?.includes("Port")) throw err;
      }
    } catch (err: any) {
      if (err.message?.includes("Port") || err.message?.includes("non-Codex"))
        throw err;
    }
  }
}
