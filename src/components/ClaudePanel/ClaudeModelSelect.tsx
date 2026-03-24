import { CyberSelect } from "@/components/ui/cyber-select";
import type { SelectOption } from "./useClaudeConfig";

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

export function ConfigSelect({ options, value, onChange, disabled }: Props) {
  if (options.length === 0) return null;
  return (
    <CyberSelect
      value={value}
      options={options.map((o) => ({ value: o.id, label: o.label }))}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
