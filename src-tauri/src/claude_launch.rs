use crate::claude_cli::{ensure_claude_channel_ready, resolve_claude_bin};
use crate::claude_session::{self, ClaudeSessionManager};
use crate::daemon::role_config;
use std::sync::Arc;
use tauri::AppHandle;

pub enum LaunchSessionMode<'a> {
    New { session_id: &'a str },
    Resume { session_id: &'a str },
}

/// Core logic for launching Claude Code in channel preview mode via a managed
/// PTY. Extracted from `mcp.rs` to keep that module under the 200-line limit.
#[allow(clippy::too_many_arguments)]
pub async fn launch_new(
    dir: &str,
    model: Option<String>,
    effort: Option<String>,
    role: &str,
    session_id: &str,
    cols: Option<u16>,
    rows: Option<u16>,
    session: Arc<ClaudeSessionManager>,
    app: AppHandle,
) -> Result<(), String> {
    launch_with_mode(
        dir,
        model,
        effort,
        role,
        LaunchSessionMode::New { session_id },
        cols,
        rows,
        session,
        app,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn resume(
    dir: &str,
    model: Option<String>,
    effort: Option<String>,
    role: &str,
    session_id: &str,
    cols: Option<u16>,
    rows: Option<u16>,
    session: Arc<ClaudeSessionManager>,
    app: AppHandle,
) -> Result<(), String> {
    launch_with_mode(
        dir,
        model,
        effort,
        role,
        LaunchSessionMode::Resume { session_id },
        cols,
        rows,
        session,
        app,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn launch_with_mode(
    dir: &str,
    model: Option<String>,
    effort: Option<String>,
    role: &str,
    session_mode: LaunchSessionMode<'_>,
    cols: Option<u16>,
    rows: Option<u16>,
    session: Arc<ClaudeSessionManager>,
    app: AppHandle,
) -> Result<(), String> {
    let version = ensure_claude_channel_ready()?;
    let claude_bin = resolve_claude_bin()?;
    let extra_args = build_launch_args(model.as_deref(), effort.as_deref(), role, session_mode);

    eprintln!(
        "[MCP] launching Claude channel {version} in managed PTY model={model:?} effort={effort:?} role={role}"
    );
    let emit_debug_logs = cfg!(debug_assertions);
    claude_session::launch(
        session,
        dir,
        &claude_bin,
        &extra_args,
        cols,
        rows,
        app,
        emit_debug_logs,
    )
    .await
}

fn build_launch_args(
    model: Option<&str>,
    effort: Option<&str>,
    role: &str,
    session_mode: LaunchSessionMode<'_>,
) -> Vec<String> {
    let mut extra_args: Vec<String> = Vec::new();
    if let Some(m) = model {
        if !m.is_empty() {
            extra_args.push("--model".into());
            extra_args.push(m.to_string());
        }
    }
    if let Some(e) = effort {
        if !e.is_empty() {
            extra_args.push("--effort".into());
            extra_args.push(e.to_string());
        }
    }

    extra_args.push("--system-prompt".into());
    extra_args.push(role_config::claude_system_prompt(role));
    extra_args.push("--append-system-prompt".into());
    extra_args.push(role_config::claude_append_system_prompt(role));
    match session_mode {
        LaunchSessionMode::New { session_id } => {
            extra_args.push("--session-id".into());
            extra_args.push(session_id.to_string());
        }
        LaunchSessionMode::Resume { session_id } => {
            extra_args.push("--resume".into());
            extra_args.push(session_id.to_string());
        }
    }
    extra_args
}

#[cfg(test)]
mod tests {
    use super::{build_launch_args, LaunchSessionMode};

    #[test]
    fn launch_args_use_system_and_append_prompt_layers() {
        let args = build_launch_args(
            Some("sonnet"),
            Some("high"),
            "coder",
            LaunchSessionMode::New {
                session_id: "session-123",
            },
        );
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--system-prompt" && !w[1].is_empty()));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--append-system-prompt" && !w[1].is_empty()));
    }

    #[test]
    fn launch_args_preserve_optional_model_and_effort() {
        let args = build_launch_args(
            Some("sonnet"),
            Some("high"),
            "lead",
            LaunchSessionMode::New {
                session_id: "session-123",
            },
        );
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--model" && w[1] == "sonnet"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--effort" && w[1] == "high"));
    }

    #[test]
    fn launch_args_include_explicit_session_id_for_new_sessions() {
        let args = build_launch_args(
            None,
            None,
            "lead",
            LaunchSessionMode::New {
                session_id: "session-123",
            },
        );
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--session-id" && w[1] == "session-123"));
    }

    #[test]
    fn launch_args_use_resume_flag_for_existing_sessions() {
        let args = build_launch_args(
            None,
            None,
            "coder",
            LaunchSessionMode::Resume {
                session_id: "resume-456",
            },
        );
        assert!(args
            .windows(2)
            .any(|w| w[0] == "--resume" && w[1] == "resume-456"));
        assert!(
            !args.iter().any(|arg| arg == "--session-id"),
            "resume launch should not also inject a new --session-id"
        );
    }
}
