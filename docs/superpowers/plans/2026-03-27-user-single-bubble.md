# User Single Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一次用户输入在消息面板中只显示一个 user 气泡，即使它在 `auto` 模式下被 fan-out 到多个 agent。

**Architecture:** 根因不是事件重复监听，而是当前系统把“用户输入”直接建模成多条 transport 级 `BridgeMessage`。`auto` 模式下，前端会按目标角色拆成多条 `daemon_send_message`，daemon 又会把每条 transport 消息都回显到 GUI，于是消息面板看到两条甚至多条一模一样的 user 气泡。修复方向应当是把“用户输入意图”和“内部路由包”拆开：用户输入只产生一次 UI 回显，fan-out 只发生在 daemon 内部，不再把每个目标副本都当成一条独立聊天消息展示。

**Tech Stack:** React, Zustand, Tauri commands, Rust async daemon, Tokio

---

## Root Cause

- `src/stores/bridge-store/index.ts` 的 `sendToCodex()` 在 `auto` 模式下会按在线 agent role 循环调用 `daemon_send_message`，一次用户输入会变成多条 `BridgeMessage`。
- `src-tauri/src/daemon/routing.rs` 的 `route_message()` 会在每条消息成功路由后都 `emit_agent_message()` 到 GUI。
- `src/components/MessagePanel/MessageBubble.tsx` 只按 `msg.from === "user"` 决定样式，不展示 `msg.to`，所以多条发往不同 target 的 user 消息会显示成多条完全相同的 user 气泡。
- 这不是“重复事件”问题，而是“展示层错误地直接消费 transport 副本”问题。

## Non-Goals

- 不在这次修复里顺手重做整个消息模型。
- 不把 agent-to-agent 消息也统一重构成新的显示模型。
- 不靠“相同文本去重”修这个 bug；相同文本在不同时间或不同 target 上都可能是合法消息。

## Files

- Modify: `src/stores/bridge-store/index.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/daemon/mod.rs`
- Modify: `src-tauri/src/daemon/types.rs`
- Modify: `src-tauri/src/daemon/routing.rs`
- Modify: `src-tauri/src/daemon/gui.rs`
- Modify: `src/components/ReplyInput.tsx`
- Modify: `src/components/MessagePanel/MessageBubble.tsx`
- Test: `src-tauri/src/daemon/routing.rs`
- Test: `src-tauri/src/daemon/state_tests.rs` or a new daemon test module if helper extraction makes这里更合适
- Optional doc touch: `docs/agentbridge-audit-summary.md`

### Task 1: 把“用户输入”从 transport message 中拆出来

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/daemon/mod.rs`
- Modify: `src-tauri/src/daemon/types.rs`

- [ ] **Step 1: 设计新的 daemon 命令**

新增一条专门的用户输入命令，而不是继续让前端拼多条 `BridgeMessage`：

```rust
pub enum UserTarget {
    Auto,
    Role(String),
}

pub enum DaemonCmd {
    SendUserInput {
        content: String,
        target: UserTarget,
    },
    // existing variants...
}
```

- [ ] **Step 2: 写失败用例，描述期望行为**

新增/调整 daemon 侧测试，表达以下语义：

- 用户输入是一次 intent，而不是多条显示消息
- `Auto` 目标只在 daemon 内部解析在线角色
- fan-out 后内部可以发多条 transport message，但 display 层只应有一次 user echo

- [ ] **Step 3: 接通新的 Tauri command**

在 `commands.rs` 中新增：

```rust
#[tauri::command]
pub async fn daemon_send_user_input(
    content: String,
    target: String,
    sender: State<'_, DaemonSender>,
) -> Result<(), String>
```

并把 `target` 解析成 `UserTarget::Auto` 或 `UserTarget::Role(...)`。

- [ ] **Step 4: 保留旧 `daemon_send_message` 只给内部链路使用**

不要立刻删除旧入口，但前端用户输入不再直接调用它，避免一次输入继续生成多条 GUI 可见消息。

### Task 2: 把 fan-out 下沉到 daemon，并只发一次 GUI user echo

**Files:**
- Modify: `src-tauri/src/daemon/mod.rs`
- Modify: `src-tauri/src/daemon/routing.rs`
- Modify: `src-tauri/src/daemon/gui.rs`

- [ ] **Step 1: 提取“解析用户目标”的纯函数**

建议在 daemon 侧新增一个纯函数，例如：

```rust
fn resolve_user_targets(state: &DaemonState, target: &UserTarget) -> Vec<String>
```

规则：

- `Auto`：只返回当前在线 agent 对应的 role
- 去重
- 不允许返回 `user`

- [ ] **Step 2: 写失败测试**

至少覆盖：

- Claude/Codex 都在线时，`Auto` 返回两个 role
- 只有一个 agent 在线时，`Auto` 只返回一个 role
- 两个 agent role 相同或异常时，结果仍去重
- `user` 不是合法 fan-out target

- [ ] **Step 3: 新增“单次 user echo + 内部 fan-out”的处理逻辑**

在 daemon run loop 中处理 `SendUserInput`：

1. 先构造一条只用于 GUI 展示的 user 消息并 `emit_agent_message`
2. 再把同一次输入 fan-out 到解析后的 target roles
3. fan-out 时使用内部路由 helper，禁止再次把这些 transport 副本回显到 GUI

不要复用当前“每条 message 都 emit 到 GUI”的默认路径；这里需要显式区分：

- `display echo`
- `transport delivery`

- [ ] **Step 4: 为 routing 增加 suppress-display 能力**

推荐做法之一：

```rust
pub async fn route_message_with_display(
    state: &SharedState,
    app: &AppHandle,
    msg: BridgeMessage,
    display_in_gui: bool,
)
```

让现有 `route_message()` 作为默认 `display_in_gui = true` 的包装器保留。

这样用户输入 fan-out 时就可以传 `false`，避免多次 user 气泡。

### Task 3: 前端改为发送一次用户输入，而不是循环发多条 message

**Files:**
- Modify: `src/stores/bridge-store/index.ts`
- Modify: `src/components/ReplyInput.tsx`

- [ ] **Step 1: 写失败测试或最小验证脚本**

如果当前仓库没有前端测试基础设施，这一步先记录为手动验证场景：

- Claude 和 Codex 同时在线
- 目标选 `auto`
- 发送一条消息
- 期望 Messages 面板只出现一个 user 气泡

- [ ] **Step 2: 改 `sendToCodex()` 为单次 invoke**

当前逻辑：

```ts
for (const t of targets) sendOne(t)
```

应改成：

```ts
invoke("daemon_send_user_input", {
  content,
  target: target ?? "auto",
})
```

在线 agent 解析不再由前端做事实判断，避免前后端状态漂移。

- [ ] **Step 3: 保持 ReplyInput 语义不变**

`ReplyInput` 仍然可以保留 `auto / lead / coder / reviewer / tester` 选择器，但它表达的是“用户意图”，不再等于最终 transport target 集合。

### Task 4: 修正消息展示语义，避免后续同类误判

**Files:**
- Modify: `src/components/MessagePanel/MessageBubble.tsx`
- Optional: `src/types.ts`

- [ ] **Step 1: 明确 user bubble 代表“输入意图”**

如果 display 消息和 transport 消息彻底拆开，这一步可只保留现有样式逻辑。

- [ ] **Step 2: 评估是否补充目标信息**

可选增强，不是本次阻断修复：

- 对显式 target 的用户输入，在 header 里显示 `To coder`
- 对 `auto` 模式显示 `To auto`

这一步不是修根因所必需；若实现，会提升可观测性。

### Task 5: 补齐回归验证

**Files:**
- Test: `src-tauri/src/daemon/routing.rs`
- Test: 新增与 `SendUserInput` 相关的 daemon tests
- Optional doc touch: `docs/agentbridge-audit-summary.md`

- [ ] **Step 1: 添加 daemon 层回归测试**

至少覆盖：

- `SendUserInput(Auto)` 在两个 agent 在线时，只触发一次 display echo
- 同时 fan-out 到两个 role
- `SendUserInput(Role("coder"))` 只 fan-out 一次
- 任何路径都不把 `user` 当成内部 target

- [ ] **Step 2: 手动验证 UI**

Run:

```bash
cargo test
npm run build
```

手动场景：

1. Claude/Codex 同时在线，`auto` 发送一条消息，只出现一个 user 气泡
2. 仅一个 agent 在线，`auto` 发送，仍只出现一个 user 气泡
3. 显式选 `coder` 或 `reviewer`，仍只出现一个 user 气泡
4. agent 回复给 `user` 时，只出现一条 agent 气泡，不影响已有回路

- [ ] **Step 3: 更新审计文档**

在 `docs/agentbridge-audit-summary.md` 补一条：

- 根因：display 模型错误复用 transport 副本
- 处理：用户输入改单次 echo + daemon 内部 fan-out

## Recommended Commit Split

1. `refactor: add daemon-level send_user_input command`
2. `fix: emit a single user bubble for auto fan-out`
3. `test: cover single-bubble user input fan-out`
4. `docs: record user single-bubble root cause and resolution`

## Acceptance Criteria

- `auto` 模式下，无论 fan-out 到几个 agent，Messages 面板都只出现一个 user 气泡。
- 真实路由行为不变：多个在线 agent 仍然能收到同一条用户输入。
- 不使用“相同文本去重”这种脆弱策略。
- 前端不再以自己的在线状态作为 fan-out 事实来源。
- `cargo test` 和 `npm run build` 通过。
