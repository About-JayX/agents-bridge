import { AgentStatusPanel } from "./components/AgentStatus";
import { MessagePanel } from "./components/MessagePanel";
import { ReplyInput } from "./components/ReplyInput";
import { ShellContextBar } from "./components/ShellContextBar";
import { TaskPanel } from "./components/TaskPanel";

export default function App() {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden font-sans text-foreground"
      style={{
        background:
          "radial-gradient(circle at top, rgba(34,197,94,0.08), transparent 28%), linear-gradient(180deg, #090a0d 0%, #0c0d12 48%, #08090c 100%)",
      }}
    >
      <ShellContextBar />

      <div className="flex flex-1 min-h-0">
        <main className="flex min-w-0 flex-1 flex-col animate-in fade-in duration-500">
          <MessagePanel />
          <ReplyInput />
        </main>

        <aside className="hidden w-[340px] shrink-0 border-l border-border/40 bg-linear-to-b from-card/60 via-card/35 to-background/40 lg:flex lg:flex-col xl:w-[360px]">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <AgentStatusPanel />
              <TaskPanel />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
