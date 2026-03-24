import type { BridgeMessage } from "../types";
import type { DaemonStatus } from "../control-protocol";

export interface DaemonClientEvents {
  codexMessage: [BridgeMessage];
  disconnect: [];
  status: [DaemonStatus];
}
