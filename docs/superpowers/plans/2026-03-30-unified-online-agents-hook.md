# 在线 Agent 查询统一化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Claude 和 Codex 提供统一、对称的“在线 agent 查询”能力，并顺手修掉当前 `Claude` 离线但缓存 role 阴影掉在线 `Codex` 的错误路由问题。

**Architecture:** daemon 维护唯一事实源，产出结构化的在线实例快照；Codex 通过现有 dynamic tool `get_status()` 获取，Claude 通过新增 MCP tool `get_online_agents` 获取。两边都返回相同 JSON 结构，只暴露“谁在线、是什么角色、来自哪个模型通道”，不在 bridge / daemon 中替 agent 做智能决策。system prompt 只负责告诉 agent 可以调用该 hook 看当前谁在线。

**Tech Stack:** Rust (`tauri`, `tokio`, `serde`, `serde_json`), bridge MCP, Codex app-server dynamic tools, Claude channel bridge

---

## 背景与现状

- 当前 `Codex` 可以调用 `get_status()`，但返回的是拼出来的一段字符串：
  - `Claude role: lead, Codex role: coder, Online agents: [claude, codex]`
- 当前 `Claude` 没有对称的 agent-facing 在线查询 hook。
- 当前在线信息不是实例级结构化数据，只是：
  - 单份 `claude_role`
  - 单份 `codex_role`
  - `attached_agents` / `codex_inject_tx` 推导出的在线名字
- 当前 `routing.rs` 仍有一个已复现的 live bug：
  - `Claude` 离线但其缓存 role 仍是 `lead`
  - `Codex` 在线且 role 也是 `lead`
  - 消息发给 `lead` 时会先命中离线 Claude 分支并被错误缓冲
- 当前 `Codex` WS 连接链刚经历了一轮重构（`ws_client.rs` + unsplit pump loop + `session_epoch`），这条链本身是后续在线查询 hook 的前置稳定性依赖：
  - pump loop 需要稳定转发 inbound/outbound
  - 旧 session cleanup 不能覆盖新 session 的 `inject_tx`
  - 重连后的消息路由必须先恢复可靠，再叠加新 hook

## 本轮范围

本轮只做基础链路统一，不做实例级精确路由。

### 这轮要做

- 给 daemon 增加结构化的在线 agent 快照
- 让 `Codex` 的 `get_status()` 改成返回结构化 JSON
- 给 `Claude` 增加对称的 `get_online_agents` MCP tool
- 更新 Claude / Codex system instructions，让 agent 知道如何查询在线 agent
- 修掉当前 `lead offline, buffered` 这条错误路由
- 同步更新文档

### 这轮不做

- 不新增 `send_to_agent_id`
- 不新增 `reply_to_agent_id`
- 不做 `lead -> worker` 的实例级精确回复
- 不改 agent-to-agent 协议语义
- 不在 bridge / daemon 中帮 LLM 自动选择目标 worker
- 不改 UI，让前端展示实例列表或实例选择器

**关于 `senderAgentId` 的定位：** 这轮只透传发送方身份，不提供实例级回复能力。`senderAgentId` 是为下一阶段多实例路由预埋的身份链，当前阶段 lead 还不能按实例精确回给某个 agent，路由仍然按 role 投递。

### 承载方式说明（有意不对称）

Claude 和 Codex 接收 `senderAgentId` 的方式不同，这是有意设计，不是遗漏：

| Agent | 承载方式 | 原因 |
|-------|---------|------|
| Claude | 结构化 channel meta（`params.meta.sender_agent_id`） | Claude channel 协议原生支持 meta 字段 |
| Codex | 格式化文本（`Message from lead [claude] (status: done):`） | Codex 入站只接受纯文本 inject，当前没有结构化 meta 通道 |

这不是最终形态。如果 Codex 后续支持结构化入站协议，应升级为与 Claude 对称的结构化传递。

## 输出数据形状

本轮统一返回如下 JSON 结构：

```json
{
  "online_agents": [
    {
      "agent_id": "claude",
      "role": "lead",
      "model_source": "claude"
    },
    {
      "agent_id": "codex",
      "role": "coder",
      "model_source": "codex"
    }
  ]
}
```

每条消息还会携带发送方实例标识：

| 字段 | 内部 Rust 名 | 对外 JSON / channel meta 名 | 说明 |
|------|-------------|---------------------------|------|
| 发送方实例 | `sender_agent_id` | `senderAgentId` | 标识消息来自哪个 agent 实例（如 `"claude"`、`"codex"`） |

命名规则：

- Rust 代码内部：`sender_agent_id`（snake_case）
- BridgeMessage JSON wire format（serde `rename_all = "camelCase"`）：`senderAgentId`
- Claude channel meta（手工构建，与现有 `from`/`status` 保持一致）：`sender_agent_id`
- 前端 TypeScript 类型：`senderAgentId`
- Codex 格式化文本：`[agent_id]` 后缀形式，不是独立字段

说明：

- `agent_id`
  - 当前阶段先用稳定的运行通道 id
  - Claude 用 `claude`
  - Codex 先用 `codex`
  - 后续如果要升级到线程级或实例级，再扩展为真实实例 id
- `role`
  - 当前该 agent 的职责角色
- `model_source`
  - 当前消息来自哪条模型链路，例如 `claude` / `codex`

## Files

### 新增

- `docs/superpowers/plans/2026-03-30-unified-online-agents-hook.md`

### 修改

- `src-tauri/src/daemon/types.rs`
- `bridge/src/types.rs`
- `src-tauri/src/daemon/state.rs`
- `src-tauri/src/daemon/state_tests.rs`
- `src-tauri/src/daemon/codex/ws_client.rs`
- `src-tauri/src/daemon/codex/session.rs`
- `src-tauri/src/daemon/codex/runtime.rs`
- `src-tauri/src/daemon/codex/mod.rs`
- `src-tauri/src/daemon/codex/handler.rs`
- `src-tauri/src/daemon/codex/handshake.rs`（如需更新 tool 说明）
- `bridge/src/tools.rs`
- `bridge/src/mcp.rs`
- `bridge/src/mcp_protocol.rs`
- `bridge/src/daemon_client.rs`
- `src-tauri/src/daemon/role_config/claude_prompt.rs`
- `src-tauri/src/daemon/role_config/roles.rs`
- `src-tauri/src/daemon/routing.rs`
- `src-tauri/src/daemon/routing_tests.rs`
- `src-tauri/src/daemon/routing_behavior_tests.rs`
- `docs/agentnexus-audit-summary.md`
- `docs/agents/codex-chain.md`
- `docs/agents/claude-chain.md`

---

### Task 0: 稳定 Codex WS pump loop 与 session lifecycle

**Files:**
- Modify: `src-tauri/src/daemon/codex/ws_client.rs`
- Modify: `src-tauri/src/daemon/codex/session.rs`
- Modify: `src-tauri/src/daemon/codex/runtime.rs`
- Modify: `src-tauri/src/daemon/codex/mod.rs`
- Modify: `src-tauri/src/daemon/state.rs`
- Modify: `src-tauri/src/daemon/state_tests.rs`
- Modify: `docs/agentnexus-audit-summary.md`
- Modify: `docs/agents/codex-chain.md`

- [ ] **Step 1: 把当前 WS 生命周期稳定性写成显式前置条件**

本轮在线查询 hook 建立在现有 Codex WS 链路已经稳定的前提上。需要先确认以下 3 条成立：

- unsplit pump loop 能稳定转发所有 inbound / outbound 消息
- `session_epoch` / `clear_codex_session_if_current(epoch)` 能防止旧 session cleanup 覆盖新 session
- 重连后 `codex_inject_tx` 仍然指向当前活动 session

- [ ] **Step 2: 为现有 `session_epoch` 修复补回计划级说明与回归测试索引**

这一步不是新增设计，而是把当前已落地的竞态修复纳入实施前置条件，避免后续执行者不知道为什么需要 epoch。

- [ ] **Step 3: 若 WS pump loop 仍存在首条消息丢失/重连后不投递问题，先收口再继续**

若这一层不稳定，Task 3 / Task 4 的在线查询 hook 无法可靠交付。

- [ ] **Step 4: 跑当前 Codex session / routing 相关验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::state::state_tests::stale_codex_session_cleanup_cannot_clear_new_session`  
Expected: PASS

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::codex`  
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/daemon/codex/ws_client.rs src-tauri/src/daemon/codex/session.rs src-tauri/src/daemon/codex/runtime.rs src-tauri/src/daemon/codex/mod.rs src-tauri/src/daemon/state.rs src-tauri/src/daemon/state_tests.rs docs/agentnexus-audit-summary.md docs/agents/codex-chain.md
git commit -m "fix: stabilize codex ws lifecycle before online-agent hook"
```

---

### Task 1: 定义统一的在线 agent 快照结构

**Files:**
- Modify: `src-tauri/src/daemon/types.rs`
- Modify: `bridge/src/types.rs`

- [ ] **Step 1: 在 daemon types 中新增结构化快照类型**

新增：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OnlineAgentInfo {
    pub agent_id: String,
    pub role: String,
    pub model_source: String,
}
```

- [ ] **Step 2: bridge 侧不镜像 `OnlineAgentInfo`，只透传 `serde_json::Value`**

bridge 只是把 daemon 返回的在线 agent JSON 回给 Claude，不负责维护第二份同构 Rust struct，避免双份类型漂移。

`bridge/src/types.rs` 只在“如需新增 daemon WS query/response 枚举”时修改，不新增第二份 `OnlineAgentInfo`。

- [ ] **Step 3: 给类型层补最小 serde 测试**

至少确认字段名为：

- `agentId`
- `role`
- `modelSource`

- [ ] **Step 4: 跑类型相关测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::types`  
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/daemon/types.rs bridge/src/types.rs
git commit -m "feat: add online agent snapshot type at daemon boundary"
```

---

### Task 2: 让 daemon state 产出统一的在线实例快照

**Files:**
- Modify: `src-tauri/src/daemon/state.rs`
- Modify: `src-tauri/src/daemon/state_tests.rs`

- [ ] **Step 1: 在 `DaemonState` 上新增 `online_agents_snapshot()`**

建议签名：

```rust
pub fn online_agents_snapshot(&self) -> Vec<OnlineAgentInfo>
```

当前阶段规则：

- Claude 在线：输出 `{ agent_id: "claude", role: self.claude_role, model_source: "claude" }`
- Codex 在线：输出 `{ agent_id: "codex", role: self.codex_role, model_source: "codex" }`
- 其他未来 bridge agent 如果还没有稳定角色来源，本轮先不纳入统一结构

- [ ] **Step 2: 输出顺序固定**

固定顺序：

1. `claude`
2. `codex`
3. 其他未来扩展项再按 `agent_id` 排序

避免测试和 prompt 输出不稳定。

- [ ] **Step 3: 增加状态层测试**

至少覆盖：

- 无 agent 在线
- 只有 Claude 在线
- 只有 Codex 在线
- Claude/Codex 同时在线
- role 随当前 `claude_role` / `codex_role` 变化

- [ ] **Step 4: 跑 state tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::state::state_tests`  
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/daemon/state.rs src-tauri/src/daemon/state_tests.rs
git commit -m "feat: add daemon online agent snapshot"
```

---

### Task 3: 把 Codex 的 `get_status()` 升级为结构化对称接口

**Files:**
- Modify: `src-tauri/src/daemon/codex/handler.rs`
- Modify: `src-tauri/src/daemon/codex/handshake.rs`（仅在 tool 描述需要同步时）
- Modify: `docs/agents/codex-chain.md`

- [ ] **Step 1: 保留工具名 `get_status`，只升级返回内容**

为了不扩大迁移面，本轮不改 Codex tool 名字。继续叫 `get_status()`，但返回值改成 JSON 文本：

```json
{
  "online_agents": [...]
}
```

- [ ] **Step 2: 删除旧的 ad-hoc 字符串拼接**

不再返回：

- `Claude role: ...`
- `Codex role: ...`
- `Online agents: [...]`

统一改为结构化 JSON。

- [ ] **Step 3: 为 Codex handler 增加测试**

至少断言：

- 返回值是合法 JSON
- 顶层有 `online_agents`
- 每个元素包含 `agent_id` / `role` / `model_source`

- [ ] **Step 4: 跑 Codex handler 测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::codex::handler`  
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/daemon/codex/handler.rs src-tauri/src/daemon/codex/handshake.rs docs/agents/codex-chain.md
git commit -m "feat: return structured online agent data to codex"
```

---

### Task 4: 给 Claude 增加对称的 `get_online_agents` MCP tool

**Files:**
- Modify: `bridge/src/tools.rs`
- Modify: `bridge/src/mcp.rs`
- Modify: `bridge/src/mcp_protocol.rs`
- Modify: `bridge/src/types.rs`
- Modify: `bridge/src/daemon_client.rs`
- Modify: `src-tauri/src/daemon/types.rs`
- Modify: `src-tauri/src/daemon/control/handler.rs`

- [ ] **Step 1: 在 bridge 侧新增一个只读 MCP tool**

工具名建议固定为：

- `get_online_agents`

无参数，返回与 Codex 相同的 JSON 结构：

```json
{
  "online_agents": [...]
}
```

- [ ] **Step 2: 把 tool 加入 Claude 的 `tools/list`**

当前只有 `reply`。本轮改成：

- `reply`
- `get_online_agents`

- [ ] **Step 3: 让 Claude 侧工具实现复用统一结构**

不要重新发明第二种格式。

目标是：

- Claude MCP tool 返回的 JSON
- Codex `get_status()` 返回的 JSON

字段、命名、结构完全一致。

- [ ] **Step 4: 明确实现路径为 bridge → daemon 的 WS request/response**

本轮明确不让 bridge 自己缓存在线状态，也不从 channel notification 侧推导。

实现路径固定为：

1. Claude 调 `get_online_agents`
2. bridge 通过现有 bridge ↔ daemon WS 增加一个查询 request
3. daemon 返回当前 `online_agents_snapshot`
4. bridge 原样把 JSON 回给 Claude

这一步需要在 bridge / daemon 的 WS 协议中新增一个最小 request/response 通道。

- [ ] **Step 5: 增加 bridge tests**

至少覆盖：

- tool list 中包含 `get_online_agents`
- 调用后返回结构化 JSON
- payload shape 与预期一致

- [ ] **Step 6: 跑 bridge tests**

Run: `cargo test --manifest-path bridge/Cargo.toml`  
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add bridge/src/tools.rs bridge/src/mcp.rs bridge/src/mcp_protocol.rs bridge/src/types.rs bridge/src/daemon_client.rs src-tauri/src/daemon/types.rs src-tauri/src/daemon/control/handler.rs
git commit -m "feat: expose online agent hook to claude"
```

---

### Task 5: 更新 Claude / Codex 的 system instructions

**Files:**
- Modify: `src-tauri/src/daemon/role_config/claude_prompt.rs`
- Modify: `src-tauri/src/daemon/role_config/roles.rs`
- Modify: `bridge/src/mcp_protocol.rs`
- Modify: `docs/agents/claude-chain.md`
- Modify: `docs/agents/codex-chain.md`

- [ ] **Step 1: 更新 Claude system prompt**

加入明确说明：

- 可调用 `get_online_agents()`
- 返回项包括：
  - `agent_id`
  - `role`
  - `model_source`
- `lead` 需要自己决定把工作发给哪个 worker
- transport 层不会替你选目标

- [ ] **Step 2: 更新 Codex baseInstructions**

把当前：

- `get_status(): see which agents are online`

改成更明确的版本：

- `get_status()` returns a structured `online_agents` list
- each item includes `agent_id`, `role`, and `model_source`

- [ ] **Step 3: 不在 bridge/daemon 增加“智能改写”**

本轮只更新 system / instructions，不新增“如果 lead 没选人就自动猜一个 coder”的逻辑。

- [ ] **Step 4: 增加 prompt tests**

断言 prompt 中明确提到：

- `get_online_agents` 或 `get_status`
- `agent_id`
- `role`
- `model_source`
- `senderAgentId`（或 `sender_agent_id`，取决于承载格式）

- [ ] **Step 4.5: 验收项 — prompt / instructions 双边一致性**

`claude_system_prompt()` 和 bridge MCP `CHANNEL_INSTRUCTIONS` 对以下内容的表述必须一致，不允许一边有一边没有：

- `get_online_agents` 工具的存在和用途
- `senderAgentId` 字段的存在和含义
- 默认路由规则（lead 是 non-lead 的默认收件人）
- role 列表和描述

本轮实现后必须有测试或 review checklist 锁住这一点。如果后续修改任一侧的 prompt/instructions，必须同时检查另一侧是否需要同步。

- [ ] **Step 5: 跑 prompt tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::role_config`  
Expected: PASS

Run: `cargo test --manifest-path bridge/Cargo.toml mcp_protocol`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/daemon/role_config/claude_prompt.rs src-tauri/src/daemon/role_config/roles.rs bridge/src/mcp_protocol.rs docs/agents/claude-chain.md docs/agents/codex-chain.md
git commit -m "docs: teach agents to use online agent hook"
```

---

### Task 6: 修掉当前 `lead offline, buffered` 的 live routing bug

**Files:**
- Modify: `src-tauri/src/daemon/routing.rs`
- Modify: `src-tauri/src/daemon/routing_tests.rs`
- Modify: `src-tauri/src/daemon/routing_behavior_tests.rs`
- Modify: `docs/agentnexus-audit-summary.md`

- [ ] **Step 1: 先写失败测试，锁住现场复现**

测试场景：

- `claude_role = "lead"`
- Claude 离线
- `codex_role = "lead"`
- Codex 在线
- 给 `lead` 发一条消息

期望：

- `Delivered`
- 不能 `Buffered`
- 消息应进入在线 Codex

- [ ] **Step 2: 跑单测确认 RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml route_to_live_codex_when_offline_claude_shares_role`  
Expected: FAIL

- [ ] **Step 3: 做最小修复，改成“在线优先收集 candidates”**

修复原则：

- 不做“Claude 分支优先 / Codex 分支优先”的 if 顺序修补
- 先收集所有 `role == target` 且当前在线的 candidates
- 只有在 candidates 为空时才允许 `Buffered`
- 只要至少存在一个在线 candidate，就不能因为离线同 role agent 的缓存 role 而误 buffer
- 不在这轮引入实例级精确路由

建议形态：

```rust
let candidates = collect_online_role_targets(state, msg.to);

if candidates.is_empty() {
    // no online target -> buffer
} else {
    // current phase: use current routing semantics for delivery
}
```

- [ ] **Step 4: 再补一个保护测试**

至少补一条：

- 当目标 role 当前完全无人在线时，仍旧保持 `Buffered`

再补一条：

- 当离线 agent 与在线 agent 共享同 role 时，只要存在在线 candidate，就不得 `Buffered`

避免把正常离线缓存路径打坏。

- [ ] **Step 5: 跑 routing tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml daemon::routing`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/daemon/routing.rs src-tauri/src/daemon/routing_tests.rs src-tauri/src/daemon/routing_behavior_tests.rs docs/agentnexus-audit-summary.md
git commit -m "fix: route by live online role targets"
```

---

### Task 7: 全量验证与文档同步

**Files:**
- Modify: `docs/agentnexus-audit-summary.md`
- Modify: `docs/agents/codex-chain.md`
- Modify: `docs/agents/claude-chain.md`

- [ ] **Step 1: 更新审计文档**

记录：

- Codex / Claude 在线查询能力已统一
- `get_status()` / `get_online_agents()` 返回相同结构
- 当前阶段仍不支持 `send_to_agent_id`
- 当前阶段仍不做实例级精确 agent-to-agent 路由
- `lead offline, buffered` 路由 bug 已修复

- [ ] **Step 2: 跑全量验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`  
Expected: PASS

Run: `cargo test --manifest-path bridge/Cargo.toml`  
Expected: PASS

Run: `cargo clippy --workspace --all-targets -- -D warnings`  
Expected: PASS

Run: `bun test tests/`  
Expected: PASS

Run: `bun run build`  
Expected: PASS

- [ ] **Step 3: 检查文件行数**

Run:

```bash
wc -l src-tauri/src/daemon/*.rs src-tauri/src/daemon/codex/*.rs bridge/src/*.rs | sort -n
```

Expected:

- 修改过的文件不超过 200 行
- 若超过，需在同一任务中完成拆分

- [ ] **Step 4: 最终提交**

```bash
git add docs/agentnexus-audit-summary.md docs/agents/codex-chain.md docs/agents/claude-chain.md
git commit -m "feat: unify online agent visibility across claude and codex"
```

---

## 备注

- 这份计划故意把“在线实例可见性统一”和“实例级精确路由”拆成两个阶段。
- 本轮先把基础感知能力和已知 live bug 收口，不在协议层一次性引入 `send_to_agent_id`。
- 如果这轮计划通过，下一轮再单独写：
  - 多个同角色 agent 同时在线时的 agent-to-agent 协议
  - `lead -> worker` 的实例级精确指派
  - `reply_to_agent_id` / `send_to_agent_id` 的线路升级
