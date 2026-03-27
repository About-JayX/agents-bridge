use crate::daemon::types::{BridgeMessage, PermissionRequest};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri::async_runtime;
use super::window_focus::focus_main_window;

/// Generation counter for Claude thinking idle timeout.
/// Each ThinkingStarted/Preview bumps this and spawns a delayed Done check.
/// Each Done/Reset bumps this to invalidate pending timeouts.
static CLAUDE_THINKING_GEN: AtomicU64 = AtomicU64::new(0);

/// Idle timeout: emit Done if no Preview/Reply arrives within this window.
const CLAUDE_THINKING_IDLE_SECS: u64 = 15;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageEvent {
    pub payload: BridgeMessage,
    pub timestamp: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemLogEvent {
    pub level: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeTerminalDataEvent {
    pub data: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeTerminalStatusEvent {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusEvent {
    pub agent: String,
    pub online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PermissionPromptEvent {
    pub agent: String,
    pub request_id: String,
    pub tool_name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_preview: Option<String>,
    pub created_at: u64,
}

pub fn emit_agent_message(app: &AppHandle, msg: &BridgeMessage) {
    let _ = app.emit(
        "agent_message",
        AgentMessageEvent {
            payload: msg.clone(),
            timestamp: msg.timestamp,
        },
    );
}

pub fn emit_system_log(app: &AppHandle, level: &str, message: &str) {
    let _ = app.emit(
        "system_log",
        SystemLogEvent {
            level: level.into(),
            message: message.into(),
        },
    );
}

pub fn emit_claude_terminal_data(app: &AppHandle, data: &str) {
    let _ = app.emit(
        "claude_terminal_data",
        ClaudeTerminalDataEvent { data: data.into() },
    );
}

pub fn emit_claude_terminal_reset(app: &AppHandle) {
    let _ = app.emit("claude_terminal_reset", ());
}

pub fn emit_claude_terminal_status(
    app: &AppHandle,
    running: bool,
    exit_code: Option<i32>,
    detail: Option<String>,
) {
    let _ = app.emit(
        "claude_terminal_status",
        ClaudeTerminalStatusEvent {
            running,
            exit_code,
            detail,
        },
    );
}

/// Emitted when Claude terminal shows an interactive prompt needing user input.
pub fn emit_claude_terminal_attention(app: &AppHandle) {
    focus_main_window(app);
    let _ = app.emit("claude_terminal_attention", ());
}

/// Codex streaming event — thinking, deltas, and agent messages.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CodexStreamPayload {
    Thinking,
    Delta { text: String },
    Message { text: String },
    TurnDone { status: String },
}

pub fn emit_codex_stream(app: &AppHandle, payload: CodexStreamPayload) {
    let _ = app.emit("codex_stream", payload);
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ClaudeStreamPayload {
    ThinkingStarted,
    Preview { text: String },
    Done,
    Reset,
}

pub fn emit_claude_stream(app: &AppHandle, payload: ClaudeStreamPayload) {
    match &payload {
        ClaudeStreamPayload::ThinkingStarted | ClaudeStreamPayload::Preview { .. } => {
            spawn_thinking_idle_timeout(app);
        }
        ClaudeStreamPayload::Done | ClaudeStreamPayload::Reset => {
            // Bump generation so any pending idle timeout becomes stale.
            CLAUDE_THINKING_GEN.fetch_add(1, Ordering::SeqCst);
        }
    }
    let _ = app.emit("claude_stream", payload);
}

/// Bump the generation and spawn a delayed task that emits Done if the
/// generation hasn't changed (meaning no new Preview/Reply/Reset arrived).
fn spawn_thinking_idle_timeout(app: &AppHandle) {
    let gen = CLAUDE_THINKING_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(CLAUDE_THINKING_IDLE_SECS)).await;
        if CLAUDE_THINKING_GEN.load(Ordering::SeqCst) == gen {
            let _ = app.emit("claude_stream", ClaudeStreamPayload::Done);
        }
    });
}

pub fn emit_agent_status(app: &AppHandle, agent: &str, online: bool, exit_code: Option<i32>) {
    let _ = app.emit(
        "agent_status",
        AgentStatusEvent {
            agent: agent.into(),
            online,
            exit_code,
        },
    );
}

pub fn emit_permission_prompt(
    app: &AppHandle,
    agent: &str,
    request: &PermissionRequest,
    created_at: u64,
) {
    let _ = app.emit(
        "permission_prompt",
        PermissionPromptEvent {
            agent: agent.into(),
            request_id: request.request_id.clone(),
            tool_name: request.tool_name.clone(),
            description: request.description.clone(),
            input_preview: request.input_preview.clone(),
            created_at,
        },
    );
}
