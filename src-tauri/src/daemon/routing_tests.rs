use super::*;
use crate::daemon::{state::DaemonState, types::BridgeMessage};
use std::sync::Arc;
use tokio::sync::RwLock;

#[tokio::test]
async fn route_to_offline_agent_buffers() {
    let state = Arc::new(RwLock::new(DaemonState::new()));
    let msg = BridgeMessage::system("hello", "lead");
    let result = route_message_inner(&state, msg).await;
    assert!(matches!(result, RouteResult::Buffered));
    assert_eq!(state.read().await.buffered_messages.len(), 1);
}

#[tokio::test]
async fn route_to_user_returns_to_gui() {
    let state = Arc::new(RwLock::new(DaemonState::new()));
    let msg = BridgeMessage::system("hello", "user");
    let result = route_message_inner(&state, msg).await;
    assert!(matches!(result, RouteResult::ToGui));
}

#[tokio::test]
async fn route_to_claude_from_unknown_sender_drops() {
    let state = Arc::new(RwLock::new(DaemonState::new()));
    let msg = BridgeMessage {
        id: "msg-1".into(),
        from: "intruder".into(),
        to: "lead".into(),
        content: "hello".into(),
        timestamp: 1,
        reply_to: None,
        priority: None,
    };
    let result = route_message_inner(&state, msg).await;
    assert!(matches!(result, RouteResult::Dropped));
}

// ── resolve_user_targets tests ──────────────────────────────────────

#[test]
fn explicit_target_returns_single_role() {
    let s = DaemonState::new();
    assert_eq!(resolve_user_targets(&s, "coder"), vec!["coder"]);
}

#[test]
fn auto_with_no_agents_returns_empty() {
    let s = DaemonState::new();
    assert!(resolve_user_targets(&s, "auto").is_empty());
}

#[test]
fn auto_with_claude_only() {
    let mut s = DaemonState::new();
    let (tx, _rx) = tokio::sync::mpsc::channel(1);
    s.attached_agents
        .insert("claude".into(), crate::daemon::state::AgentSender::new(tx, 0));
    let targets = resolve_user_targets(&s, "auto");
    assert_eq!(targets, vec!["lead"]);
}

#[test]
fn auto_with_codex_only() {
    let mut s = DaemonState::new();
    let (tx, _rx) = tokio::sync::mpsc::channel(1);
    s.codex_inject_tx = Some(tx);
    let targets = resolve_user_targets(&s, "auto");
    assert_eq!(targets, vec!["coder"]);
}

#[test]
fn auto_with_both_agents_returns_two_roles() {
    let mut s = DaemonState::new();
    let (claude_tx, _) = tokio::sync::mpsc::channel(1);
    let (codex_tx, _) = tokio::sync::mpsc::channel(1);
    s.attached_agents
        .insert("claude".into(), crate::daemon::state::AgentSender::new(claude_tx, 0));
    s.codex_inject_tx = Some(codex_tx);
    let targets = resolve_user_targets(&s, "auto");
    assert_eq!(targets, vec!["lead", "coder"]);
}

#[test]
fn auto_dedupes_when_same_role() {
    let mut s = DaemonState::new();
    s.claude_role = "coder".into();
    s.codex_role = "coder".into();
    let (claude_tx, _) = tokio::sync::mpsc::channel(1);
    let (codex_tx, _) = tokio::sync::mpsc::channel(1);
    s.attached_agents
        .insert("claude".into(), crate::daemon::state::AgentSender::new(claude_tx, 0));
    s.codex_inject_tx = Some(codex_tx);
    let targets = resolve_user_targets(&s, "auto");
    // Same role — should deduplicate to one entry
    assert_eq!(targets, vec!["coder"]);
}

#[test]
fn auto_excludes_user_role() {
    let mut s = DaemonState::new();
    s.claude_role = "user".into();
    let (tx, _) = tokio::sync::mpsc::channel(1);
    s.attached_agents
        .insert("claude".into(), crate::daemon::state::AgentSender::new(tx, 0));
    // "user" role should be filtered out from auto targets
    let targets = resolve_user_targets(&s, "auto");
    assert!(targets.is_empty());
}

// ── is_valid_agent_role tests ─────────────────────────────────────

#[test]
fn valid_roles_accepted() {
    for role in &["lead", "coder", "reviewer", "tester"] {
        assert!(crate::daemon::is_valid_agent_role(role), "{role} should be valid");
    }
}

#[test]
fn user_role_rejected() {
    assert!(!crate::daemon::is_valid_agent_role("user"));
}

#[test]
fn unknown_role_rejected() {
    assert!(!crate::daemon::is_valid_agent_role("admin"));
    assert!(!crate::daemon::is_valid_agent_role(""));
}

// ── fan-out behavior tests (route_message_inner level) ────────────

#[tokio::test]
async fn auto_fanout_delivers_to_both_agents() {
    let state = Arc::new(RwLock::new(DaemonState::new()));
    let (claude_tx, mut claude_rx) = tokio::sync::mpsc::channel(8);
    let (codex_tx, mut codex_rx) = tokio::sync::mpsc::channel(8);
    {
        let mut s = state.write().await;
        s.attached_agents.insert(
            "claude".into(),
            crate::daemon::state::AgentSender::new(claude_tx, 0),
        );
        s.codex_inject_tx = Some(codex_tx);
    }
    // Resolve targets then route each — simulates route_user_input fan-out
    let targets = {
        let s = state.read().await;
        resolve_user_targets(&s, "auto")
    };
    assert_eq!(targets.len(), 2);
    for role in &targets {
        let msg = BridgeMessage {
            id: format!("test_{role}"),
            from: "user".into(),
            to: role.clone(),
            content: "hello".into(),
            timestamp: 1,
            reply_to: None,
            priority: None,
        };
        let result = route_message_inner(&state, msg).await;
        assert!(matches!(result, RouteResult::Delivered));
    }
    assert!(claude_rx.try_recv().is_ok());
    assert!(codex_rx.try_recv().is_ok());
}

#[tokio::test]
async fn explicit_user_target_routes_to_gui() {
    // Even if someone sends to="user" explicitly, routing treats it as GUI
    let state = Arc::new(RwLock::new(DaemonState::new()));
    let msg = BridgeMessage {
        id: "u1".into(),
        from: "user".into(),
        to: "user".into(),
        content: "hello".into(),
        timestamp: 1,
        reply_to: None,
        priority: None,
    };
    let result = route_message_inner(&state, msg).await;
    assert!(matches!(result, RouteResult::ToGui));
    // No buffer — message was not silently dropped
    assert!(state.read().await.buffered_messages.is_empty());
}
