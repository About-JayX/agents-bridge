# Codex 链路修复记录

> **强制规则:** 每次修复或发现 Codex 链路问题，必须在此文档记录。
> 包括：问题描述、根因、修复方案、运行时验证结果。
> 未修复的问题也必须记录，标注 `[未修复]` 和原因。

## 官方文档参考

- 完整 API: `docs/agents/codex-app-server-api.md`
- 在线: https://developers.openai.com/codex/app-server
- **注意: 官方文档与 CLI 实现存在多处不一致，以运行时测试为准！**

## 协议对照与修复记录

### 2026-03-25: 初始协议审计

#### [已修复] 缺少 `initialized` 通知

**问题:** 官方文档要求 `initialize` 响应后必须发送 `{ "method": "initialized", "params": {} }`。
当前实现没有发送，导致 app-server 不继续处理后续请求。

**修复:** `session.rs` 收到 init response 后发送 `initialized` 通知。

**验证:** 运行时测试确认握手成功。

#### [已修复] dynamicTools schema 字段名 — 文档与实现不一致

**问题:** 官方文档写 `parameters`，但 Codex CLI 实际要求 `inputSchema`。
报错: `Invalid request: missing field 'inputSchema'`

**根因:** 官方文档与 CLI 实现不一致。

**修复:** 保持 `inputSchema`。曾错误改为 `parameters`，验证失败后改回。

**教训:** 官方文档不可信，必须运行时测试验证。

#### [已修复] sandbox 值格式 — 全局统一 kebab-case

**问题:** 三次修复才找到正确方案。

| 尝试 | 方案 | 结果 |
|------|------|------|
| 1 | `roles.rs` 全改 camelCase | config.toml 报错 `unknown variant 'workspaceWrite'` |
| 2 | `roles.rs` kebab, `session.rs` 转 camelCase | `thread/start` 报错 `unknown variant 'workspaceWrite'` |
| 3 | 全部 kebab-case，不做转换 | 成功 |

**结论:** Codex CLI 全部使用 kebab-case (`workspace-write`, `read-only`)，包括 JSON-RPC `thread/start` 的 `sandbox` 参数。与官方文档的 camelCase 描述完全相反。

**验证:** `bun` 脚本直接测试 `inputSchema` + kebab-case → `thread/start` 成功。

#### [已修复] `--config` CLI flags 格式

**验证:** `--config sandbox_mode="workspace-write"` 格式正确。

### 2026-03-25: 生命周期问题

#### [已修复] stop→start 竞态 — 端口未释放

**问题:** Disconnect 后立即 Connect，新 codex 进程报 `Address already in use (os error 48)`。

**根因:** `lifecycle::stop()` kill 进程后，OS 需要时间释放端口 4500。新进程立即启动时端口仍被占。

**修复:**
1. `lifecycle::stop()` kill 后等 500ms 端口释放
2. `codex::start()` 启动前轮询端口空闲（最多 5s）

#### [已修复] Codex 孤儿进程 — PPID=1

**问题:** Disconnect 后 `codex app-server` 进程仍然存活，PPID=1（已脱离进程树）。

**根因:** Codex CLI 内部 fork/exec 真正的 app-server。`kill_on_drop(true)` 和 `start_kill()` 只能 kill 直接子进程，不能 kill 孙进程。

**修复:** `lifecycle::stop()` 增加 `kill_port_holder()` — 用 `lsof -ti:{port}` 找到端口占用进程并 SIGKILL。

**运行时验证:** Connect→Disconnect→Connect 循环成功。日志显示 `[Codex] killing orphan process {pid} on port 4500`。

#### [已修复] agent_status(true) 在握手完成前发出

**问题:** `codex::start()` spawn session 后台任务后立即 emit `agent_status(true)`，但此时握手（initialize→initialized→thread/start）尚未完成。前端显示 Connected 但 thread ID 还没拿到。

**修复:** `session::run()` 接受 `ready_tx` oneshot，握手成功后发送 thread ID。`codex::start()` 等待 `ready_rx` 收到 thread ID 后才 emit `agent_status(true)`。

#### [已修复] 握手失败资源泄漏

**问题:** 当 `session::run()` 握手失败（返回空 thread ID）时，`codex::start()` bail 但未清理：
- 健康监控任务继续运行（孤儿 task）
- 子进程未被 kill（Arc 引用计数 > 0）
- 临时目录未清理

**修复:** 失败路径增加: `cancel.cancel()` + `lifecycle::stop(&mut child)` + `cleanup_session()`。

#### [已修复] CODEX_HOME 在进程仍引用时被删除

**问题:** `CodexHandle::stop()` 中 `cleanup_session()` 删除 `/tmp/agentbridge-{pid}-{id}/`，但旧 codex 进程可能还在读取该目录下的文件。新 session 的 `thread/start` 报错: `CODEX_HOME points to "/tmp/agentbridge-...", but that path does not exist`。

**根因:** stop 删目录 → start 创建新 session 用新 ID → 但旧进程引用的目录已被删。这发生在端口还没释放、新进程复用了旧 CODEX_HOME 的路径时。

**修复:** 每次 start 用独立的 session ID（递增），stop 时先 kill 进程再删目录，加端口释放等待。

### 2026-03-25: 深度审查补充修复

#### [已修复] pre-init buffer replay break 不传播

**问题:** `bridge/mcp.rs` 中 pre-init 消息回放时，`write_line` 失败的 `break` 只退出 `for` 循环，不退出外层 `loop`。MCP task 在 stdout 损坏后继续运行。

**修复:** 增加 `replay_ok` flag，`for` 循环后检查并 `break` 外层循环。

## 待确认项

#### [待确认] `settings.developer_instructions` 有效性

**问题:** 当前把 `developer_instructions` 放在 `params.settings.developer_instructions`。官方文档未明确此字段。

**状态:** 保持当前实现，等运行时有 Codex 响应后验证。

#### [待确认] tool response 格式

**问题:** handler.rs 回复格式:
```json
{ "id": id, "result": { "contentItems": [{ "type": "inputText", "text": "..." }], "success": true } }
```
需确认是否与 Codex 期望的 dynamic tool call response 格式匹配。

**状态:** ✅ 运行时验证通过（v0.116.0）。`contentItems` 格式仍然有效。

### 2026-03-26: codex v0.88.0 — `--listen` 不存在，exit status: 2

**问题:** 启动 Codex 时日志出现 `Codex process exited prematurely with status: exit status: 2`。

**根因:** `codex 0.88.0` 没有 `--listen` flag。该 flag 是在 2026-02-11 PR #11370 "Reapply 'Add app-server transport layer with websocket support'" 加入的，v0.88.0（2026-01-21 发布）早于该 PR，app-server 在 v0.88.0 中只支持 stdio 模式，不监听 TCP/WebSocket 端口。

**修复:** 升级 codex 至 v0.116.0（`brew upgrade codex`）。

**验证:** ✅ 升级后 `codex app-server --listen ws://127.0.0.1:4500` 正常启动，输出:
```
codex app-server (WebSockets)
  listening on: ws://127.0.0.1:4500
  readyz: http://127.0.0.1:4500/readyz
  healthz: http://127.0.0.1:4500/healthz
```

### 2026-03-26: codex v0.116.0 — `item/tool/call` params.name → params.tool

**问题:** 升级到 v0.116.0 后 dynamic tool handler 不触发，Codex 不会调用 `reply`/`check_messages`/`get_status`。

**根因:** `item/tool/call` 通知的参数结构在 v0.116.0 中变更：
- 旧: `{"method":"item/tool/call","id":N,"params":{"name":"reply","arguments":{...}}}`
- 新: `{"method":"item/tool/call","id":N,"params":{"threadId":"...","turnId":"...","callId":"...","tool":"reply","arguments":{...}}}`

`session.rs` 读 `v["params"]["name"]`，新版返回 `undefined`，导致 handler 永不匹配。

**修复:** `session.rs` 优先读 `v["params"]["tool"]`，降级兜底读 `v["params"]["name"]`（向后兼容）。

**文件:** `src-tauri/src/daemon/codex/session.rs`

**验证:** ✅ tool call response 格式（`contentItems`）仍然有效；turn 成功完成。

### 2026-03-26: Port 4500 残留进程导致 Codex 启动失败

**问题:** 重启 app 后启动 Codex 报 `Port 4500 still in use after 5s`。

**根因:** 上一轮的 `codex app-server` 进程未被正确 kill（`kill_on_drop` 依赖父进程正常退出，`pkill` 可能遗漏 fork 出的子进程）。残留进程持续占用端口。

**修复:** 手动 `kill $(lsof -ti:4500)` 后重新 Connect Codex。

**预防:** `lifecycle.rs::stop()` 已有 `kill_port_holder` 兜底，但仅在 daemon 正常调用 `stop` 时生效。app 异常退出（SIGKILL/crash）时端口不会被清理。

**验证:** ✅ kill 残留后正常启动。

### 2026-03-26: Codex 事件静默丢弃 — 用户看不到 thinking 和回复

**问题:** 消息成功 delivered 到 Codex（`[Route] user → coder delivered`），但 GUI 无任何后续反馈。

**根因:** `session.rs` 事件循环只处理 `item/tool/call`，其他所有 Codex 通知（`turn/started`、`item/agentMessage/delta`、`item/completed`、`turn/completed`）全部 `continue` 跳过。

完整 Codex 事件流（运行时抓包确认）：
```
turn/started → item/started(userMessage) → item/completed(userMessage)
→ item/started(reasoning) → item/completed(reasoning)
→ item/started(dynamicToolCall) → item/tool/call → item/completed(dynamicToolCall)
→ item/started(agentMessage) → item/agentMessage/delta × N → item/completed(agentMessage)
→ turn/completed
```

**问题分两层:**

1. **Rust 层（事件丢弃）:** `session.rs` 事件循环只匹配 `item/tool/call`，其余事件 continue 跳过。Codex 的 agentMessage 和 thinking 永远不会到达前端。
2. **前端层（无渲染路径）:** 即使 Rust 侧转发了事件，前端没有对应的 listener 和 UI 组件来显示 Codex 流式输出。`agent_message` 事件只渲染到 Messages 面板的消息列表，没有实时 streaming 指示器。

**修复（Rust 侧）:**
- `session.rs` 新增 `handle_codex_event()` 分发函数，处理 5 种事件
- 新增 `codex_stream` Tauri 事件枚举（`Thinking`/`Delta`/`Message`/`TurnDone`），通过 `gui::emit_codex_stream()` 发出
- `item/completed(agentMessage)` 双发：`agent_message`（消息历史）+ `codex_stream`（实时显示）

**修复（前端层）:**
- `types.ts` 新增 `CodexStreamState` 接口（thinking/currentDelta/lastMessage/turnStatus）
- `helpers.ts` 新增 `codex_stream` 事件 listener，按 `kind` 字段分发更新 store
- `currentDelta` 字符串累加设 100KB 上限，防止长回复导致内存膨胀
- 新增 `CodexStreamIndicator.tsx` 组件：thinking 时显示 `"thinking…"` 动画脉冲；收到 delta 后实时追加显示流式文本
- `MessagePanel/index.tsx` 在消息列表底部渲染 `<CodexStreamIndicator />`
- turn 完成后清空 currentDelta 和 thinking 状态，指示器自动消失

**完整数据流:**
```
Codex app-server → WS :4500 → session.rs handle_codex_event()
  → gui::emit_codex_stream(Thinking/Delta/Message/TurnDone)
    → Tauri event "codex_stream"
      → helpers.ts listener → zustand codexStream state
        → CodexStreamIndicator 组件实时渲染

  → gui::emit_agent_message() (仅 item/completed agentMessage)
    → Tauri event "agent_message"
      → helpers.ts listener → zustand messages[]
        → MessagePanel 消息列表永久渲染
```

**文件:** `session.rs`, `gui.rs`, `helpers.ts`, `types.ts`, `sync.ts`, `index.ts`, `CodexStreamIndicator.tsx`, `MessagePanel/index.tsx`

**验证:** ✅ 用户可见 thinking → 流式文本 → 完成消息渲染到 Messages 面板。

### 2026-03-26: 角色 instructions 重构与强制性研究

#### 研究结论：指令约束力分层

| 层级 | 机制 | 强制性 |
|------|------|--------|
| L0 OS 沙箱 | Codex `sandbox_mode` (Seatbelt/bubblewrap) | 不可绕，内核级 |
| L1 工具可用性 | Claude `--tools`/`--disallowedTools`；Codex `dynamicTools` | 不可绕，物理不存在 |
| L2 路由拦截 | daemon `routing.rs` sender gating | 不可绕，代码控制 |
| L3 权限门 | Claude `permissionMode`；Codex `approval_policy` | 基本不可绕 |
| L4 System Prompt | Claude `--append-system-prompt`；Codex `base_instructions` | 软约束 |
| L5 Developer 指令 | Codex `developer_instructions`；Claude MCP `instructions` | 软约束 |
| L6 CLAUDE.md | 用户级上下文 | 最弱 |

**当前产品定位:** 自动化执行工具，权限全开。角色 instructions 不做权限限制，只规范路由行为和回复格式。

#### 修复：role_instructions 重构

- `roles.rs` 改用 `role_instructions!` 宏，compile-time `concat!` 拼接共享前言 + 角色专属段
- 共享前言：角色图谱、工具说明、主动汇报进展、自行判断路由目标
- 每个角色附加典型路由路径（如 lead: `receive task → assign coder → send reviewer → report user`）
- read-only 角色（reviewer/tester）明确写 "read-only sandbox"，不写 "full permissions"
- write 角色（user/lead/coder）写 "full permissions, execute directly"

**文件:** `src-tauri/src/daemon/role_config/roles.rs`

#### 修复：Claude MCP instructions 扩充

- `CHANNEL_INSTRUCTIONS` 从简短指引扩展为完整角色图谱 + 路由规则 + 工作风格
- `initialize_result(role)` 运行时追加 `"Your role: {role}"`

**文件:** `bridge/src/mcp_protocol.rs`

### 2026-03-26: Superpowers 代码审查修复

#### [已修复] I-1: currentDelta 字符串无限累加

**问题:** `helpers.ts` 的 delta handler 无限拼接 `currentDelta`，长回复导致内存膨胀和 React 重渲染性能下降。

**修复:** 设 100KB 上限，超过截断。

**文件:** `src/stores/bridge-store/helpers.ts`

#### [已修复] I-2: upsert_mcp_server 测试断言被弱化

**问题:** 添加 `env` 字段后，测试 fixture 缺少 `env`，`changed` 永远为 true，`assert!(!changed)` 被注释掉。"unchanged" 路径不再被测试覆盖。

**修复:** fixture 补全 `env: { "AGENTBRIDGE_ROLE": "lead" }`，恢复 `assert!(!changed)`。

**文件:** `src-tauri/src/mcp.rs`

#### [已修复] I-4: read-only 角色指令声称 "full permissions"

**问题:** `role_instructions!` 共享前言写 "You have full permissions"，但 reviewer/tester 的 `sandbox_mode` 是 `"read-only"`（OS 内核级限制）。LLM 被误导后尝试写文件会被内核拒绝。

**修复:** 移除共享前言中的权限声明，改为按角色写入：write 角色写 "full permissions"，read-only 角色写 "read-only sandbox, cannot modify files"。

**文件:** `src-tauri/src/daemon/role_config/roles.rs`

#### [已修复] M-4/M-5: 文件超 200 行限制

**修复:**
- `MessagePanel/index.tsx` 提取 `CodexStreamIndicator.tsx`（28 行）
- `helpers.ts` 提取 `sync.ts`（60 行）

## 当前已知限制

- 端口 4500 固定，不可配置
- `kill_port_holder` 用 SIGKILL 可能误杀同端口的其他进程
- 不处理 `item/commandExecution/requestApproval` 审批
- 不处理 `-32001` 过载错误重试
- 健康监控和 session task 独立退出时会双重 emit `agent_status(false)`
- app 异常退出时 codex app-server 残留进程不会被自动清理
- `item/completed(agentMessage)` 构造的 BridgeMessage 硬编码 `to: "user"`，不反映实际路由目标
- `dynamicTools` 未按角色过滤（所有角色收到相同 3 个工具），可做 L1 硬约束但尚未实现
