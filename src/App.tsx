import { MessagePanel } from "./components/MessagePanel";
import { ReplyInput } from "./components/ReplyInput";
import { ShellContextBar } from "./components/ShellContextBar";

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
      </div>
    </div>
  );
}
