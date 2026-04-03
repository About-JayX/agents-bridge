# Channel vs --sdk-url 完整差异对照表

> **文档状态：** `Active reference`
>
> **当前采用方案：** `--sdk-url` transport + MCP tools bridge
> **旧方案：** PTY + Channel transport

## 一句话总结

**Channel：** Claude 在假终端 PTY 里跑 → 通过 MCP stdio 连到 bridge 翻译官 → bridge 再通过 WS 连到 daemon。消息 transport 依赖 channel notification。

**--sdk-url：** Claude 作为普通子进程跑 → 直接通过 WS/HTTP 与 daemon 通信；同时仍保留 MCP bridge sidecar 作为 `reply` / `get_online_agents()` 工具提供者。

---

## 架构对比

### Channel 链路（旧）
```
Claude Code (managed PTY, 假终端)
  ↓ MCP stdio (JSON-RPC 2.0)
bridge sidecar (独立 Rust 二进制, dimweave-bridge)
  ↓ WebSocket :4502/ws
daemon control server
  ↓ Tauri events
React GUI
```

### --sdk-url 链路（当前）
```
Claude Code (普通子进程, tokio::process::Child)
  ↓ WebSocket :4502/claude (Claude 主动连入, 用户消息/控制响应)
  ↓ HTTP POST :4502/claude/events (Claude 输出回传)
  ↘ MCP stdio (tools only)
bridge sidecar (reply / get_online_agents)
  ↓ WebSocket :4502/ws
daemon control server
  ↓ Tauri events
React GUI
```

---

## 逐项对比

### 进程管理

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| Claude 运行方式 | managed PTY (`portable-pty`) | 普通子进程 (`tokio::process`) |
| 中间进程 | bridge sidecar（独立二进制） | bridge sidecar 仍保留，但只做 MCP tools，不再承载主消息 transport |
| 进程数量 | 3 个（Claude PTY + bridge + daemon） | 3 个（Claude child + bridge + daemon） |
| 启动确认 | PTY 自动检测 "development channels" 确认框并模拟按键 | 无需确认（bridge env 跳过） |
| 终端模拟 | xterm-256color, COLORTERM=truecolor | 无终端（headless） |
| 进程退出检测 | `std::thread` 轮询 `child.wait()` | `tokio::spawn` 监控进程退出 |
| 窗口大小 | PTY resize (`PtySize`) | 不适用 |

### 通信协议

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| Claude → daemon 消息 | MCP `tools/call` → bridge 翻译 → WS `AgentReply` | 主链路走 HTTP POST `/claude/events` JSON `{"events":[...]}`；MCP tool 调用仍经 bridge |
| daemon → Claude 消息 | WS `RoutedMessage` → bridge 翻译 → MCP `notifications/claude/channel` | 主链路走 WS NDJSON `{"type":"user","message":{...}}\n`；MCP tool 不走这条链 |
| 协议格式 | JSON-RPC 2.0 (MCP) + 自定义 WS 协议 (bridge) | NDJSON stream-json（Claude Code 原生 SDK 协议） |
| 协议层数 | 3 层（MCP → bridge 自定义 → daemon 自定义） | 主消息链 1 层（NDJSON）；另保留 MCP tools sidecar |
| 消息封装 | `<channel source="agentnexus" from="ROLE">` XML tag | `<channel source="agentnexus" from="ROLE">` XML tag（保持兼容） |

### Permission（权限审批）

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| 请求方向 | Claude → MCP `notifications/claude/channel/permission_request` → bridge → WS → daemon → GUI | Claude → POST `control_request(can_use_tool)` → daemon |
| 回复方向 | GUI → daemon → WS → bridge → MCP `notifications/claude/channel/permission` → Claude | daemon 直接 WS NDJSON `control_response(allow)` |
| 请求格式 | `{ request_id, tool_name, description, input_preview }` | `{ request_id, request: { subtype, tool_name, input, description } }` |
| 回复格式 | `{ request_id, behavior: "allow"\|"deny" }` | `{ response: { subtype: "success", request_id, response: { behavior } } }` |
| 中间翻译 | bridge `channel_state.rs` 管理 pending permissions | 无（daemon 直接处理，当前默认 auto-allow） |
| request_id | 5 字母（Claude 生成） | UUID（Claude 生成） |

### System Prompt（角色注入）

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| 注入方式 | `--append-system-prompt`（追加到默认 prompt 后） | `--append-system-prompt`（当前仍保留） |
| 强度 | 弱（Claude 仍有完整默认 prompt） | 弱到中（transport 已切换，但 prompt 注入位点当前未改成 `--system-prompt`） |
| 来源 | `claude_prompt.rs` → CLI 参数 | `claude_prompt.rs` → CLI 参数（同源，不同注入点） |
| Channel instructions | 嵌入在 bridge 的 MCP `initialize` response 里 | 当前仍保留在 bridge MCP `initialize` response；角色 prompt 额外通过 `--append-system-prompt` 注入 |

### MCP 工具

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| `reply(to, text, status)` | bridge MCP tool → Claude 通过 `tools/call` 调用 | bridge MCP tool（通过项目 `.mcp.json` + inline `--strict-mcp-config` upsert 注入） |
| `get_online_agents()` | bridge MCP tool | bridge MCP tool（同上） |
| MCP 注册 | 项目根 `.mcp.json` 文件（前端触发 `register_mcp`） | 项目 `.mcp.json` 继续保留；daemon 另外构造 inline `--strict-mcp-config`，确保当前 workspace 有 `agentnexus` entry |
| MCP server 发现 | Claude 读项目 `.mcp.json` | Claude 同时读项目 `.mcp.json` 与 `--strict-mcp-config` |
| Channel capability | `experimental['claude/channel']` + `experimental['claude/channel/permission']` | 仅保留 `experimental['claude/channel']`；SDK 模式不再声明 `claude/channel/permission` |

### Session 管理

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| 新 session | `--session-id <uuid>`（CLI 参数） | `--session-id <uuid>`（CLI 参数，相同） |
| 恢复 session | `--resume <session_id>`（CLI 参数） | `--resume <session_id>`（CLI 参数，相同） |
| Session 存储 | `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` | 相同 |
| Provider history | daemon 扫描 transcript JSONL | 相同 |

### Claude CLI Flags

| Flag | Channel（旧） | --sdk-url（新） |
|---|---|---|
| `--dangerously-load-development-channels server:agentnexus` | ✅ 必须 | ❌ 不需要 |
| `--dangerously-skip-permissions` | ✅ 使用 | ✅ 仍使用（当前运行时保持 Claude 本地 bypass） |
| `--mcp-config <path>` | ✅ 指向项目 `.mcp.json` | ❌ 改用 `--strict-mcp-config` |
| `--strict-mcp-config <json>` | ❌ 不使用 | ✅ inline MCP 配置 |
| `--sdk-url ws://...` | ❌ 不使用 | ✅ 核心 flag |
| `--print` | ❌ 交互模式 | ✅ headless 模式 |
| `--input-format stream-json` | ❌ 不使用 | ✅ NDJSON 输入 |
| `--output-format stream-json` | ❌ 不使用 | ✅ NDJSON 输出 |
| `--replay-user-messages` | ❌ 不使用 | ✅ 回显确认 |
| `--system-prompt` | ❌ 不使用 | ❌ 当前不用 |
| `--append-system-prompt` | ✅ 角色注入 | ✅ 当前仍用 |
| `--agent <name>` | ❌ 不使用 | ❌ bridge 模式下不可用 |
| `--model` | ✅ | ✅ |
| `--session-id` / `--resume` | ✅ | ✅ |

### 环境变量

| 变量 | Channel（旧） | --sdk-url（新） |
|---|---|---|
| `CLAUDE_CODE_ENVIRONMENT_KIND` | 不设置（默认交互模式） | `bridge`（切到 remote-control 模式） |
| `CLAUDE_CODE_SESSION_ACCESS_TOKEN` | 不设置 | `agentnexus-local`（dummy，通过存在性检查） |
| `CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2` | 不设置 | `1`（启用 h48 混合传输） |
| `CLAUDE_CODE_OAUTH_TOKEN` | 不设置（用系统 keychain） | 空字符串（清除，避免冲突） |
| `AGENTBRIDGE_ROLE` | ✅ bridge 读取 | ✅ bridge 仍读取 |
| `AGENTBRIDGE_CONTROL_PORT` | ✅ bridge 读取 | ✅ bridge 仍读取 |
| `TERM` / `COLORTERM` | ✅ PTY 需要 | ❌ 无终端 |
| `PATH` | `enriched_path()` | `enriched_path()`（相同） |

### daemon 侧改动

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| WS 端点 | `/ws`（bridge 连入） | `/claude`（Claude SDK WS） + `/claude/events`（POST） + `/ws`（bridge 仍保留） |
| State 字段 | `attached_agents["claude"]` → `AgentSender { tx, gen }` | `claude_sdk_ws_tx` + `claude_sdk_session_epoch` + `claude_sdk_*nonce*` |
| Routing 路径 | `Target::Claude(tx)` → `ToAgent::RoutedMessage` | `Target::ClaudeSdk(tx, ndjson)` → NDJSON string |
| Permission 路径 | `attached_agents["claude"].tx` → `ToAgent::PermissionVerdict` | `claude_sdk_ws_tx` → NDJSON `control_response` |
| 消息格式转换 | bridge 把 `BridgeMessage` → MCP channel notification | daemon 把 `BridgeMessage` → NDJSON user message；bridge 只承接 tools |

### 前端改动

| | Channel（旧） | --sdk-url（新） |
|---|---|---|
| 启动命令 | `register_mcp` → `launch_claude_terminal` | `register_mcp` → `daemon_launch_claude_sdk` |
| 停止命令 | `stop_claude` | `stop_claude` + `daemon_stop_claude_sdk` |
| PTY 终端面板 | `ClaudeTerminalPane.tsx`（xterm.js 渲染） | 不需要（已移除用户面） |
| Dev confirm 对话框 | `DevConfirmDialog.tsx`（确认开发 channel） | 不需要 |
| 连接前 MCP 注册 | 必须先 `register_mcp` | 仍建议先 `register_mcp`，因为 bridge tools 仍依赖 MCP 注册 |
| 终端事件监听 | `claude_terminal_data` / `claude_terminal_reset` | 不需要 |

---

## 工程形态变化

### 旧链路的主要组成

- `src-tauri/src/claude_session/`：PTY 生命周期、终端流、attention 与确认交互
- `src-tauri/src/claude_launch.rs`：旧 Claude 启动入口
- `bridge/`：同时承担 channel transport、permission relay、reply tools

### 当前链路的主要组成

- `src-tauri/src/daemon/claude_sdk/`：Claude SDK transport、protocol、launch、fallback 语义
- `src-tauri/src/daemon/control/claude_sdk_handler*.rs`：`/claude` WS 与 `/claude/events` HTTP 控制面
- `bridge/`：保留为 MCP tools provider，不再承担主消息 transport

### 结构性变化

| 指标 | Channel（旧） | `--sdk-url`（当前） |
|------|---------------|---------------------|
| Claude 主 transport | channel notification + bridge WS | SDK WS + HTTP POST |
| bridge 角色 | transport + tools + permission relay | tools 为主，transport 退居次要/兼容 |
| PTY 终端 | 必需 | 不再是主链路 |
| development channels flag | 必需 | 不再需要 |
| `--dangerously-skip-permissions` | 使用 | 仍使用 |
| 协议复杂度 | transport 与 tools 混在一起 | transport 与 tools 明确分层 |

---

## 保持不变的部分

| 部分 | 说明 |
|------|------|
| Codex 接入 | 完全不变（app-server WS :4500） |
| 消息路由 | `routing.rs` 核心逻辑不变，新增 `ClaudeSdk` target |
| BridgeMessage | 统一消息格式不变 |
| Task graph | 不变 |
| Provider history | 不变 |
| Permission GUI | Codex 和旧桥接路径仍有；Claude 当前主链路不经过 GUI permission gate |
| agent_status / agent_message events | 不变 |
| 角色系统 | 不变（lead/coder/reviewer） |
| Session resume | 不变（`--resume` flag） |
| `<channel>` XML 包装 | 保持（routing 消息仍用 channel tag 包装） |
