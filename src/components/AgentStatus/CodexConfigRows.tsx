import { cn, shortenPath } from "@/lib/utils";
import { CyberSelect } from "@/components/ui/cyber-select";

interface CodexConfigRowsProps {
  locked: boolean;
  profile: { name?: string; planType?: string } | null;
  models: { slug: string }[];
  selectedModel: string;
  modelSelectOptions: { value: string; label: string }[];
  handleModelChange: (slug: string) => void;
  reasoningOptions: { effort: string }[];
  selectedReasoning: string;
  setSelectedReasoning: (v: string) => void;
  reasoningSelectOptions: { value: string; label: string }[];
  cwd: string;
  handlePickDir: () => void;
}

export function CodexConfigRows({
  locked,
  profile,
  models,
  selectedModel,
  modelSelectOptions,
  handleModelChange,
  reasoningOptions,
  selectedReasoning,
  setSelectedReasoning,
  reasoningSelectOptions,
  cwd,
  handlePickDir,
}: CodexConfigRowsProps) {
  return (
    <div className="mt-2 space-y-1.5">
      {/* Profile (when connected) */}
      {locked && profile?.name && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Account</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-foreground">
              {profile.name}
            </span>
            {profile.planType && (
              <span className="capitalize rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                {profile.planType}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Model */}
      {models.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Model</span>
          <CyberSelect
            value={selectedModel}
            options={modelSelectOptions}
            onChange={handleModelChange}
            disabled={locked}
          />
        </div>
      )}

      {/* Reasoning — hidden until turn/start effort param is wired */}

      {/* Project / CWD */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Project</span>
        <button
          type="button"
          onClick={handlePickDir}
          disabled={locked}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] text-secondary-foreground transition-colors truncate max-w-44",
            locked
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-accent hover:text-primary cursor-pointer",
          )}
          title={cwd}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            className="shrink-0 text-muted-foreground"
          >
            <path
              d="M2 4v8h12V6H8L6 4z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          {cwd ? shortenPath(cwd) : "Select project..."}
        </button>
      </div>
    </div>
  );
}
