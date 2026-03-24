import { useBridgeStore } from "@/stores/bridge-store";
import { CyberSelect } from "@/components/ui/cyber-select";

const ROLE_OPTIONS = [
  { value: "user", label: "User (Admin)" },
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
  const setRole = useBridgeStore((s) => s.setRole);
  return (
    <CyberSelect
      value={role}
      options={ROLE_OPTIONS}
      onChange={(v) => setRole(agent, v)}
      disabled={disabled}
    />
  );
}
