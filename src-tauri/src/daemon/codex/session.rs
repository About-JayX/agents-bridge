use crate::daemon::codex::handler;
use crate::daemon::codex::handshake::{WsStream, WsTx};
use crate::daemon::gui::{self, CodexStreamPayload};
use crate::daemon::types::BridgeMessage;
use crate::daemon::SharedState;
use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::mpsc;

pub struct SessionOpts {
    pub role_id: String,
    pub cwd: String,
    pub model: Option<String>,
    pub sandbox_mode: Option<String>,
    pub developer_instructions: Option<String>,
}

pub async fn run(
    port: u16,
    opts: SessionOpts,
    state: SharedState,
    app: AppHandle,
    mut inject_rx: mpsc::Receiver<String>,
    ready_tx: tokio::sync::oneshot::Sender<String>,
) {
    match super::handshake::handshake(port, &opts, &app).await {
        Some((tid, ws_tx, stream)) => {
            let _ = ready_tx.send(tid.clone());
            event_loop(tid, &opts.role_id, &state, &app, &mut inject_rx, ws_tx, stream).await;
        }
        None => {
            let _ = ready_tx.send(String::new());
        }
    }
}

async fn event_loop(
    thread_id: String,
    role_id: &str,
    state: &SharedState,
    app: &AppHandle,
    inject_rx: &mut mpsc::Receiver<String>,
    ws_tx: WsTx,
    mut stream: WsStream,
) {
    let mut next_id: u64 = 100;
    loop {
        tokio::select! {
            msg_opt = stream.next() => {
                let Some(Ok(msg)) = msg_opt else { break };
                let Ok(v) = serde_json::from_str::<Value>(&msg.to_text().unwrap_or("")) else {
                    continue;
                };
                handle_codex_event(&v, role_id, state, app, &ws_tx).await;
            }
            inject = inject_rx.recv() => {
                let Some(text) = inject else { break };
                let id = next_id; next_id += 1;
                if ws_tx.send(json!({
                    "method": "turn/start", "id": id,
                    "params": {"threadId": &thread_id, "input": [{"type":"text","text":text}]}
                }).to_string()).await.is_err() {
                    eprintln!("[Codex] failed to inject turn/start");
                    break;
                }
            }
        }
    }
    state.write().await.codex_inject_tx = None;
    gui::emit_agent_status(app, "codex", false, None);
    gui::emit_system_log(app, "info", "[Codex] session ended");
}

async fn handle_codex_event(
    v: &Value,
    role_id: &str,
    state: &SharedState,
    app: &AppHandle,
    ws_tx: &WsTx,
) {
    let Some(method) = v["method"].as_str() else {
        return;
    };
    match method {
        "item/tool/call" => {
            let name = v["params"]["tool"]
                .as_str()
                .or_else(|| v["params"]["name"].as_str());
            if let (Some(id), Some(name)) = (v["id"].as_u64(), name) {
                let args = v["params"]["arguments"].clone();
                handler::handle_dynamic_tool(id, name, &args, role_id, state, app, ws_tx).await;
            }
        }
        "turn/started" => {
            gui::emit_codex_stream(app, CodexStreamPayload::Thinking);
        }
        "item/agentMessage/delta" => {
            if let Some(text) = v["params"]["delta"].as_str() {
                if !text.is_empty() {
                    gui::emit_codex_stream(
                        app,
                        CodexStreamPayload::Delta { text: text.into() },
                    );
                }
            }
        }
        "item/completed" => {
            if v["params"]["item"]["type"].as_str() == Some("agentMessage") {
                let text = v["params"]["item"]["text"].as_str().unwrap_or("");
                if !text.is_empty() {
                    // Emit as codex_stream for live display
                    gui::emit_codex_stream(
                        app,
                        CodexStreamPayload::Message { text: text.into() },
                    );
                    // Also emit as agent_message for message history
                    let msg = BridgeMessage {
                        id: format!("codex_{}", chrono::Utc::now().timestamp_millis()),
                        from: role_id.to_string(),
                        to: "user".to_string(),
                        content: text.to_string(),
                        timestamp: chrono::Utc::now().timestamp_millis() as u64,
                        reply_to: None,
                        priority: None,
                    };
                    gui::emit_agent_message(app, &msg);
                }
            }
        }
        "turn/completed" => {
            let status = v["params"]["turn"]["status"].as_str().unwrap_or("unknown");
            gui::emit_codex_stream(
                app,
                CodexStreamPayload::TurnDone { status: status.into() },
            );
        }
        _ => {}
    }
}
