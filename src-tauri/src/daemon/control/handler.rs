use crate::daemon::{
    gui, routing,
    types::{FromAgent, ToAgent},
    SharedState,
};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tauri::AppHandle;
use tokio::sync::mpsc;

fn is_allowed_agent(agent_id: &str) -> bool {
    matches!(agent_id, "claude" | "codex")
}

pub async fn handle_connection(socket: WebSocket, state: SharedState, app: AppHandle) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<ToAgent>(64);
    let mut agent_id: Option<String> = None;

    // Forward outbound messages to WS sink
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let Ok(payload) = serde_json::to_string(&msg) else {
                eprintln!("[Control] failed to serialize outbound message");
                continue;
            };
            if sink.send(Message::Text(payload.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(txt) = msg else { continue };
        let Ok(from_agent) = serde_json::from_str::<FromAgent>(&txt) else {
            continue;
        };

        match from_agent {
            FromAgent::AgentConnect { agent_id: id } => {
                if !is_allowed_agent(&id) {
                    gui::emit_system_log(&app, "warn", &format!("[Control] rejected agent {id}"));
                    break;
                }
                agent_id = Some(id.clone());
                let (buffered_messages, buffered_verdicts) = {
                    let mut daemon = state.write().await;
                    daemon.attached_agents.insert(id.clone(), tx.clone());
                    let role = match id.as_str() {
                        "claude" => Some(daemon.claude_role.clone()),
                        "codex" => Some(daemon.codex_role.clone()),
                        _ => None,
                    };
                    (
                        role.map(|role_id| daemon.take_buffered_for(&role_id))
                            .unwrap_or_default(),
                        daemon.take_buffered_verdicts_for(&id),
                    )
                };
                for message in buffered_messages {
                    if tx.send(ToAgent::RoutedMessage { message }).await.is_err() {
                        eprintln!("[Control] failed to send buffered message to {}", id);
                    }
                }
                for verdict in buffered_verdicts {
                    if tx.send(ToAgent::PermissionVerdict { verdict }).await.is_err() {
                        eprintln!("[Control] failed to send buffered verdict to {}", id);
                    }
                }
                gui::emit_agent_status(&app, &id, true, None);
                gui::emit_system_log(&app, "info", &format!("[Control] {id} connected"));
            }
            FromAgent::AgentReply { message } => {
                routing::route_message(&state, &app, message).await;
            }
            FromAgent::PermissionRequest { request } => {
                let Some(id) = agent_id.as_deref() else {
                    continue;
                };
                let created_at = chrono::Utc::now().timestamp_millis() as u64;
                state
                    .write()
                    .await
                    .store_permission_request(id, request.clone(), created_at);
                gui::emit_permission_prompt(&app, id, &request, created_at);
                gui::emit_system_log(
                    &app,
                    "info",
                    &format!(
                        "[Control] permission request {} from {} for {}",
                        request.request_id, id, request.tool_name
                    ),
                );
            }
            FromAgent::AgentDisconnect => break,
        }
    }

    if let Some(id) = &agent_id {
        state.write().await.attached_agents.remove(id);
        gui::emit_agent_status(&app, id, false, None);
        gui::emit_system_log(&app, "info", &format!("[Control] {id} disconnected"));
    }
}
