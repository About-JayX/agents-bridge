import type { CodexAdapter } from "../adapters/codex-adapter";
import type { TuiConnectionState } from "../tui-connection-state";

export interface GuiServerDeps {
  codex: CodexAdapter;
  tuiState: TuiConnectionState;
  currentStatus: () => any;
  broadcastStatus: () => void;
  log: (msg: string) => void;
}
