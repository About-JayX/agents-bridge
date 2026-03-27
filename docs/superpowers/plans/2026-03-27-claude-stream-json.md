# [ARCHIVED] Claude stream-json 接入 Implementation Plan

> **Status: ARCHIVED** — 实测发现 `--print --output-format stream-json` 模式下 MCP server 不会被加载（`mcp_servers: []`），Channel/bridge 链路无法工作。当前架构需要 Claude 在交互模式下运行才能加载 Channel，而交互模式不支持 stream-json 输出。两者不可兼得。
>
> 可行的替代方向：优化 PTY 输出解析（`extract_terminal_preview`），或等 Claude Code 未来支持交互模式下的结构化事件输出。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `claude -p --output-format stream-json --include-partial-messages` 替代 PTY 作为 Claude 的主数据通道，实现结构化的 token 级流式显示，同时保留 Channel/MCP bridge 用于消息路由。

**Architecture:** 当前 Claude 通过 PTY 运行，所有业务数据（streaming preview、attention 检测）都靠解析 ANSI 终端输出。新方案把 Claude 作为普通子进程用 stream-json NDJSON 协议通信：stdin 发消息，stdout 收结构化事件（`stream_event/content_block_delta` 给 token 级流式，`assistant` 给完整消息，`result` 给 turn 结束）。PTY 仅保留为可选的 debug 终端模式。MCP bridge（Channel + reply tool）继续独立运行，不受影响。

**Tech Stack:** Rust (tokio, serde_json), Tauri 2, React 19 + Zustand, Claude Code CLI v2.1.83+

---

## 已验证的 stream-json 事件格式

通过 `claude -p --output-format stream-json --include-partial-messages --verbose` 实测确认（订阅账号可用）：

```
{"type":"system","subtype":"init","tools":[...],"model":"...","session_id":"..."}
{"type":"stream_event","event":{"type":"message_start","message":{...}}}
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}}
{"type":"stream_event","event":{"type":"content_block_stop","index":0}}
{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}}}
{"type":"stream_event","event":{"type":"message_stop"}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}],...}}
{"type":"result","subtype":"success","result":"Hello world","duration_ms":...,"usage":{...}}
```

关键发现：
- `stream_event` 包裹了 Anthropic API 原生 SSE 事件（`content_block_delta` / `text_delta`）
- `assistant` 是每轮完整消息（包含 tool_use 等完整 content blocks）
- `result` 是最终结果（含 usage、cost、stop_reason）
- `system/init` 包含 tools、model、session_id 等元信息
- 需要 `--verbose` 才能使用 `stream-json` 输出格式

## Non-Goals

- 不删除 PTY 相关代码 — 保留为可选 debug 终端模式
- 不改 MCP bridge (Channel) 架构 — 消息路由继续走 bridge reply tool
- 不改 Codex 链路 — 只影响 Claude 接入
- 不支持 `--input-format stream-json` 双向通信（留给后续迭代）
- 不改前端 MessagePanel 渲染架构 — 只改数据源

## Files

### 新增

- `src-tauri/src/claude_session/stream_json.rs` — NDJSON 解析器 + 事件类型定义
- `src-tauri/src/claude_session/stream_process.rs` — stream-json 子进程管理

### 修改

- `src-tauri/src/claude_session/mod.rs` — 新增 `launch_stream` 入口 + `StreamSession` 管理
- `src-tauri/src/claude_launch.rs` — 构建 stream-json CLI 参数
- `src-tauri/src/mcp.rs` — `launch_claude_terminal` 支持模式选择
- `src-tauri/src/daemon/gui.rs` — 扩展 `ClaudeStreamPayload` 增加 `Delta`/`ToolUse`/`TurnDone` 变体
- `src/stores/bridge-store/helpers.ts` — 处理新的 stream 事件
- `src/stores/bridge-store/types.ts` — 扩展 `ClaudeStreamState`
- `src-tauri/src/commands.rs` — 新增 `launch_claude_stream` 命令

### 不改

- `bridge/**` — MCP bridge 完全不动
- `src-tauri/src/claude_session/process.rs` — PTY 模式保留
- `src-tauri/src/claude_session/prompt.rs` — PTY 模式保留
- `src-tauri/src/daemon/codex/**` — Codex 链路不动

---

### Task 1: NDJSON 事件类型定义与解析器

**Files:**
- Create: `src-tauri/src/claude_session/stream_json.rs`

这是整个计划的基础 — 定义 Claude stream-json 输出的 Rust 类型，写一个行解析器。

- [ ] **Step 1: 定义事件类型**

```rust
// stream_json.rs
use serde::Deserialize;

/// Top-level NDJSON event from `claude --output-format stream-json`
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamJsonEvent {
    System(SystemEvent),
    StreamEvent(StreamEventWrapper),
    Assistant(AssistantEvent),
    Result(ResultEvent),
    RateLimitEvent(RateLimitEvent),
}

#[derive(Debug, Deserialize)]
pub struct SystemEvent {
    pub subtype: String,
    pub session_id: Option<String>,
    // init subtype has tools, model, etc — we only need session_id
}

#[derive(Debug, Deserialize)]
pub struct StreamEventWrapper {
    pub event: ApiStreamEvent,
    pub session_id: String,
}

/// Anthropic API streaming event (subset we care about)
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ApiStreamEvent {
    MessageStart { message: serde_json::Value },
    ContentBlockStart { index: u32, content_block: ContentBlock },
    ContentBlockDelta { index: u32, delta: ContentDelta },
    ContentBlockStop { index: u32 },
    MessageDelta { delta: MessageDeltaBody },
    MessageStop,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text { text: String },
    Thinking { thinking: String },
    ToolUse { id: String, name: String },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentDelta {
    TextDelta { text: String },
    ThinkingDelta { thinking: String },
    InputJsonDelta { partial_json: String },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
pub struct MessageDeltaBody {
    pub stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AssistantEvent {
    pub message: serde_json::Value,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ResultEvent {
    pub subtype: String,
    pub result: Option<String>,
    pub session_id: String,
    pub duration_ms: Option<u64>,
    pub is_error: Option<bool>,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RateLimitEvent {
    pub rate_limit_info: serde_json::Value,
}
```

- [ ] **Step 2: 写解析测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_text_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}},"session_id":"abc"}"#;
        let event: StreamJsonEvent = serde_json::from_str(line).unwrap();
        match event {
            StreamJsonEvent::StreamEvent(w) => match w.event {
                ApiStreamEvent::ContentBlockDelta { delta, .. } => match delta {
                    ContentDelta::TextDelta { text } => assert_eq!(text, "Hello"),
                    other => panic!("unexpected delta: {other:?}"),
                },
                other => panic!("unexpected event: {other:?}"),
            },
            other => panic!("unexpected top: {other:?}"),
        }
    }

    #[test]
    fn parse_result_event() {
        let line = r#"{"type":"result","subtype":"success","result":"Hello","session_id":"abc","duration_ms":100,"is_error":false,"stop_reason":"end_turn","total_cost_usd":0.01,"usage":{},"modelUsage":{},"permission_denials":[],"fast_mode_state":"off","uuid":"x","num_turns":1}"#;
        let event: StreamJsonEvent = serde_json::from_str(line).unwrap();
        assert!(matches!(event, StreamJsonEvent::Result(_)));
    }

    #[test]
    fn parse_system_init() {
        let line = r#"{"type":"system","subtype":"init","session_id":"abc","tools":[],"model":"opus","cwd":"/tmp","permissionMode":"bypassPermissions","claude_code_version":"2.1.83","uuid":"x"}"#;
        let event: StreamJsonEvent = serde_json::from_str(line).unwrap();
        assert!(matches!(event, StreamJsonEvent::System(_)));
    }

    #[test]
    fn unknown_event_type_does_not_panic() {
        let line = r#"{"type":"unknown_future_event","data":123}"#;
        // Should return Err, not panic
        assert!(serde_json::from_str::<StreamJsonEvent>(line).is_err());
    }
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml stream_json`
Expected: 4 tests pass

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/claude_session/stream_json.rs
git commit -m "feat: add stream-json NDJSON event types and parser"
```

---

### Task 2: stream-json 子进程管理

**Files:**
- Create: `src-tauri/src/claude_session/stream_process.rs`
- Modify: `src-tauri/src/claude_session/mod.rs`

启动 Claude CLI 作为普通子进程（非 PTY），读 stdout NDJSON 行，逐事件解析并 emit 到前端。

- [ ] **Step 1: 实现子进程 spawn + stdout 行读取**

```rust
// stream_process.rs
use crate::claude_session::stream_json::{
    ApiStreamEvent, ContentDelta, StreamJsonEvent,
};
use crate::daemon::gui::{self, ClaudeStreamPayload};
use std::process::Stdio;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

pub struct StreamSession {
    child: Child,
}

impl StreamSession {
    pub async fn spawn(
        claude_bin: &str,
        args: &[String],
        cwd: &str,
        app: AppHandle,
    ) -> Result<Self, String> {
        let mut child = Command::new(claude_bin)
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::null()) // 初版不做 stdin 交互
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to spawn claude stream: {e}"))?;

        let stdout = child.stdout.take()
            .ok_or("failed to capture claude stdout")?;

        // Spawn stdout reader task
        tokio::spawn(read_stdout_lines(stdout, app));

        Ok(Self { child })
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        let _ = self.child.kill().await;
        Ok(())
    }

    pub fn id(&self) -> Option<u32> {
        self.child.id()
    }
}

async fn read_stdout_lines(
    stdout: tokio::process::ChildStdout,
    app: AppHandle,
) {
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() { continue; }
        match serde_json::from_str::<StreamJsonEvent>(&line) {
            Ok(event) => handle_event(&app, event),
            Err(e) => {
                eprintln!("[Claude stream] parse error: {e} for: {}",
                    &line[..line.len().min(120)]);
            }
        }
    }
    // Process exited
    gui::emit_claude_stream(&app, ClaudeStreamPayload::Reset);
    gui::emit_agent_status(&app, "claude", false, None);
}

fn handle_event(app: &AppHandle, event: StreamJsonEvent) {
    match event {
        StreamJsonEvent::StreamEvent(wrapper) => {
            match wrapper.event {
                ApiStreamEvent::ContentBlockDelta { delta, .. } => {
                    match delta {
                        ContentDelta::TextDelta { text } => {
                            gui::emit_claude_stream(
                                app,
                                ClaudeStreamPayload::Delta { text },
                            );
                        }
                        ContentDelta::ThinkingDelta { thinking } => {
                            gui::emit_claude_stream(
                                app,
                                ClaudeStreamPayload::Thinking { text: thinking },
                            );
                        }
                        _ => {}
                    }
                }
                ApiStreamEvent::ContentBlockStart { content_block, .. } => {
                    match &content_block {
                        crate::claude_session::stream_json::ContentBlock::ToolUse { name, .. } => {
                            gui::emit_claude_stream(
                                app,
                                ClaudeStreamPayload::ToolUse { name: name.clone() },
                            );
                        }
                        _ => {}
                    }
                }
                ApiStreamEvent::MessageStop => {
                    gui::emit_claude_stream(app, ClaudeStreamPayload::Done);
                }
                _ => {}
            }
        }
        StreamJsonEvent::Result(result) => {
            let status = result.stop_reason.unwrap_or_else(|| "unknown".into());
            gui::emit_claude_stream(
                app,
                ClaudeStreamPayload::TurnDone { status },
            );
        }
        _ => {} // system, rate_limit — 日志但不推前端
    }
}
```

- [ ] **Step 2: 扩展 ClaudeStreamPayload**

在 `gui.rs` 中增加新变体：

```rust
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ClaudeStreamPayload {
    ThinkingStarted,       // 保留 — 旧 PTY 模式用
    Preview { text: String }, // 保留 — 旧 PTY 模式用
    Done,
    Reset,
    // 新增 — stream-json 模式用
    Delta { text: String },
    Thinking { text: String },
    ToolUse { name: String },
    TurnDone { status: String },
}
```

- [ ] **Step 3: 在 mod.rs 注册新模块**

```rust
// claude_session/mod.rs 顶部新增
pub mod stream_json;
pub mod stream_process;
```

- [ ] **Step 4: 写集成测试**

对 `handle_event` 写单元测试，验证各事件类型正确映射到 `ClaudeStreamPayload` 变体。由于 `emit` 需要 `AppHandle`，测试只验证解析+映射逻辑的纯函数部分。

- [ ] **Step 5: `cargo test` + `cargo clippy` 通过**

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/claude_session/stream_process.rs \
        src-tauri/src/claude_session/stream_json.rs \
        src-tauri/src/claude_session/mod.rs \
        src-tauri/src/daemon/gui.rs
git commit -m "feat: stream-json subprocess manager with event handling"
```

---

### Task 3: Launch 链路接入 stream-json 模式

**Files:**
- Modify: `src-tauri/src/claude_launch.rs`
- Modify: `src-tauri/src/mcp.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

让前端能选择以 stream-json 模式启动 Claude（默认），PTY 模式保留为 fallback。

- [ ] **Step 1: 构建 stream-json CLI 参数**

在 `claude_launch.rs` 新增：

```rust
pub fn build_stream_args(
    dir: &str,
    model: Option<&str>,
    effort: Option<&str>,
    role: &str,
    mcp_config: &str, // .mcp.json 路径
) -> Vec<String> {
    let mut args = vec![
        "-p".into(),  // print mode (非交互)
        "--output-format".into(), "stream-json".into(),
        "--include-partial-messages".into(),
        "--verbose".into(),
        "--dangerously-skip-permissions".into(),
        "--dangerously-load-development-channels".into(),
        "server:agentnexus".into(),
        "--mcp-config".into(), mcp_config.into(),
    ];
    if let Some(m) = model {
        if !m.is_empty() { args.extend(["--model".into(), m.into()]); }
    }
    if let Some(e) = effort {
        if !e.is_empty() { args.extend(["--effort".into(), e.into()]); }
    }
    // 注入角色 system prompt
    let prompt = role_config::claude_system_prompt(role);
    args.extend(["--append-system-prompt".into(), prompt]);
    args
}
```

- [ ] **Step 2: 新增 Tauri command**

在 `commands.rs` 新增 `launch_claude_stream`。在 `main.rs` 注册。

- [ ] **Step 3: 前端使用新 launch 命令**

先在 `ClaudePanel/index.tsx` 增加模式选择（或直接默认 stream-json）。

- [ ] **Step 4: 验证启动链路**

Run: `bun run tauri dev`
手动测试：点击 Connect Claude → 确认子进程启动 → 前端收到 `claude_stream` 事件。

- [ ] **Step 5: Commit**

---

### Task 4: 前端 Claude streaming 渲染

**Files:**
- Modify: `src/stores/bridge-store/helpers.ts`
- Modify: `src/stores/bridge-store/types.ts`
- Modify: Messages 面板相关组件

处理新的 `claude_stream` 事件变体，实现类似 Codex 的流式文本渲染。

- [ ] **Step 1: 扩展 ClaudeStreamState**

```typescript
export interface ClaudeStreamState {
  thinking: boolean;
  previewText: string;   // 旧 PTY preview（保留）
  deltaText: string;     // 新 stream-json 累积文本
  currentTool: string;   // 当前 tool_use name
  turnStatus: string;    // turn 结束原因
  lastUpdatedAt: number;
}
```

- [ ] **Step 2: 处理新 claude_stream 事件**

在 `helpers.ts` 的 `claude_stream` listener 中增加 case：

```typescript
case "delta":
    // 累加文本 delta
    set(s => ({ claudeStream: { ...s.claudeStream, deltaText: s.claudeStream.deltaText + e.payload.text } }));
    break;
case "thinking":
    set(s => ({ claudeStream: { ...s.claudeStream, thinking: true } }));
    break;
case "toolUse":
    set(s => ({ claudeStream: { ...s.claudeStream, currentTool: e.payload.name } }));
    break;
case "turnDone":
    set(s => ({ claudeStream: { ...s.claudeStream, deltaText: "", currentTool: "", turnStatus: e.payload.status } }));
    break;
```

- [ ] **Step 3: Messages 面板渲染 streaming delta**

在消息列表底部增加 Claude streaming indicator（类似 Codex 的 `CodexStreamIndicator`），显示 `claudeStream.deltaText` 内容。

- [ ] **Step 4: 手动验证 UI**

- [ ] **Step 5: `bun run build` 通过**

- [ ] **Step 6: Commit**

---

### Task 5: stdin 输入链路（后续迭代的接口预留）

**Files:**
- Modify: `src-tauri/src/claude_session/stream_process.rs`

当前 `--print` 模式下 Claude 执行完就退出。要实现多轮对话需要用 `--input-format stream-json` 双向通信。这是更大的架构变更，本 Task 只预留接口。

- [ ] **Step 1: StreamSession 增加 stdin writer**

```rust
pub struct StreamSession {
    child: Child,
    stdin: Option<tokio::process::ChildStdin>,
}
```

- [ ] **Step 2: 实现 send_user_message (stub)**

```rust
pub async fn send_message(&mut self, content: &str) -> Result<(), String> {
    // TODO: 下一迭代实现 --input-format stream-json 双向通信
    let _ = content;
    Err("stream-json input not yet implemented".into())
}
```

- [ ] **Step 3: Commit**

---

### Task 6: 回归测试与文档

**Files:**
- Test: `src-tauri/src/claude_session/stream_json.rs`
- Modify: `CLAUDE.md`
- Modify: `docs/agentnexus-audit-summary.md`

- [ ] **Step 1: 补充 stream_json 边界测试**

- tool_use content_block_start/delta 解析
- thinking delta 解析
- message_stop / message_delta 解析
- 未知 event type 不 panic
- 畸形 JSON 不 panic

- [ ] **Step 2: `cargo test` + `cargo clippy --workspace --all-targets -- -D warnings` 通过**

- [ ] **Step 3: `bun run build` 通过**

- [ ] **Step 4: 更新 CLAUDE.md 架构图**

新增 stream-json 模式到架构描述。

- [ ] **Step 5: 更新审计文档**

- [ ] **Step 6: Commit**

---

## Acceptance Criteria

- `claude -p --output-format stream-json --include-partial-messages` 的输出能被 Rust 正确解析为结构化事件
- `content_block_delta/text_delta` 事件被实时推送到前端，Messages 面板能逐 token 渲染 Claude 输出
- PTY 模式仍可用（`launch_claude_terminal` 不删除）
- MCP bridge 链路（Channel + reply tool）完全不受影响
- `cargo test` + `cargo clippy` + `bun run build` 全部通过
- 所有源码文件 ≤ 200 行

## Recommended Commit Split

1. `feat: add stream-json NDJSON event types and parser`
2. `feat: stream-json subprocess manager with event handling`
3. `feat: launch_claude_stream command + CLI args builder`
4. `feat: frontend Claude streaming delta rendering`
5. `refactor: stdin writer stub for future bidirectional mode`
6. `test+docs: stream-json regression tests and architecture update`

## Risk Assessment

| 风险 | 影响 | 缓解 |
|------|------|------|
| `--include-partial-messages` 在未来版本行为变更 | stream_event 格式变化 | serde 宽松解析 + `#[serde(other)]` fallback |
| `--print` 模式执行完即退出，不支持多轮 | 单轮限制 | Task 5 预留 stdin 接口，后续迭代用 `--input-format stream-json` |
| Channel MCP 与 stream-json 是否冲突 | 可能影响 channel 注册 | 实测确认 `--mcp-config` 在 `--print` 模式下仍加载 MCP server |
| 前端同时收到 PTY 和 stream-json 事件 | UI 混乱 | 两种模式互斥，前端按 launch mode 过滤 |
