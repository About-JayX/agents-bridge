import { cn } from "@/lib/utils";
import { useBridgeStore } from "@/stores/bridge-store";

const ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "coder", label: "Coder" },
  { value: "reviewer", label: "Reviewer" },
  { value: "tester", label: "Tester" },
];

export function RoleSelect({
  agent,
  disabled,
}: {
  agent: "claude" | "codex";
  disabled?: boolean;
}) {
  const role = useBridgeStore((s) =>
    agent === "claude" ? s.claudeRole : s.codexRole,
  );
  const setRole = useBridgeStore((s) => s.setAgentRole);
  return (
    <select
      value={role}
      onChange={(e) => setRole(agent, e.target.value)}
      disabled={disabled}
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground border border-input outline-none",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      {ROLE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
