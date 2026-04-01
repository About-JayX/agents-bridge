use crate::daemon::{
    gui::{self, ClaudeStreamPayload},
    SharedState,
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tauri::AppHandle;
use tokio::sync::mpsc;

/// WS handler — Claude connects here via `--sdk-url ws://127.0.0.1:4502/claude`.
/// We use this WS to send NDJSON messages TO Claude.
pub async fn ws_handler(
    State((state, app)): State<(SharedState, AppHandle)>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state, app))
}

async fn handle_ws_connection(socket: WebSocket, state: SharedState, app: AppHandle) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<String>(64);

    let epoch = {
        let mut s = state.write().await;
        let epoch = s.claude_sdk_epoch();
        if !s.attach_claude_sdk_ws(epoch, tx.clone()) {
            eprintln!("[ClaudeSDK] failed to attach WS — epoch mismatch");
            return;
        }
        // Signal the launch flow that WS is connected, passing the inject sender
        if let Some(ready_tx) = s.claude_sdk_ready_tx.take() {
            let _ = ready_tx.send(tx.clone());
        }
        epoch
    };

    gui::emit_agent_status(&app, "claude", true, None, None);
    gui::emit_system_log(&app, "info", "[ClaudeSDK] Claude connected via WS");
    gui::emit_system_log(
        &app,
        "info",
        &format!(
            "[Claude Trace] chain=ws_connected epoch={} ws={} events={} direction=daemon->claude:ws_ndjson claude->daemon:http_post",
            epoch,
            crate::daemon::claude_sdk::process::sdk_ws_url(4502),
            crate::daemon::claude_sdk::process::sdk_events_url(4502),
        ),
    );

    // Forward outbound NDJSON to the WS sink
    let sink_task = tokio::spawn(async move {
        while let Some(ndjson) = rx.recv().await {
            if sink.send(Message::Text(ndjson)).await.is_err() {
                break;
            }
        }
    });

    // Read loop: handle incoming WS messages (keep-alive pings, etc.)
    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Ping(data) => {
                // Pong is handled automatically by most WS impls, but log it
                eprintln!("[ClaudeSDK] received ping ({} bytes)", data.len());
            }
            Message::Close(_) => break,
            _ => {
                // In hybrid mode Claude sends output via HTTP POST, not WS.
                // Log unexpected WS messages for debugging.
                eprintln!("[ClaudeSDK] unexpected WS message from Claude");
            }
        }
    }

    sink_task.abort();

    // Clean up on disconnect
    {
        let mut s = state.write().await;
        s.clear_claude_sdk_ws(epoch);
    }
    gui::emit_claude_stream(&app, ClaudeStreamPayload::Reset);
    gui::emit_agent_status(&app, "claude", false, None, None);
    gui::emit_system_log(&app, "info", "[ClaudeSDK] Claude disconnected");
    gui::emit_system_log(
        &app,
        "info",
        &format!("[Claude Trace] chain=ws_disconnected epoch={epoch}"),
    );
}

#[derive(Deserialize)]
struct EventsBody {
    events: Vec<serde_json::Value>,
}

/// HTTP POST handler — Claude POSTs events as `{"events": [...]}`.
pub async fn events_handler(
    State((state, app)): State<(SharedState, AppHandle)>,
    body: String,
) -> impl IntoResponse {
    let parsed: Result<EventsBody, _> = serde_json::from_str(&body);
    match parsed {
        Ok(body) => {
            gui::emit_system_log(
                &app,
                "info",
                &format!("[Claude Trace] chain=http_post {}", summarize_events_batch(&body)),
            );
            // Process events in background — return HTTP 200 immediately so Claude
            // doesn't block waiting for our response while we handle control_requests.
            let s = state.clone();
            let a = app.clone();
            tokio::spawn(async move {
                for event in body.events {
                    process_sdk_event(&s, &a, event).await;
                }
            });
            axum::Json(serde_json::json!({"ok": true}))
        }
        Err(err) => {
            eprintln!("[ClaudeSDK] failed to parse events body: {err}");
            axum::Json(serde_json::json!({"ok": false, "error": err.to_string()}))
        }
    }
}

/// Dispatch a single Claude SDK event to the event handler module.
async fn process_sdk_event(state: &SharedState, app: &AppHandle, event: serde_json::Value) {
    let role = state.read().await.claude_role.clone();
    gui::emit_system_log(
        app,
        "info",
        &format!(
            "[Claude Trace] chain=event_dispatch role={} {}",
            role,
            summarize_event_shape(&event)
        ),
    );
    crate::daemon::claude_sdk::event_handler::handle_events(
        vec![event],
        &role,
        state.clone(),
        app.clone(),
    )
    .await;
}

fn summarize_events_batch(body: &EventsBody) -> String {
    let events = body
        .events
        .iter()
        .map(summarize_event_shape)
        .collect::<Vec<_>>()
        .join("; ");
    format!("count={} events=[{}]", body.events.len(), events)
}

fn summarize_event_shape(event: &serde_json::Value) -> String {
    let event_type = event["type"].as_str().unwrap_or("unknown");
    let session = event["session_id"]
        .as_str()
        .or_else(|| event["sessionId"].as_str())
        .unwrap_or("-");
    match event_type {
        "assistant" => {
            let content = &event["message"]["content"];
            let content_items = content.as_array().map_or(0, Vec::len);
            let text_len = extract_event_text_len(content);
            format!(
                "assistant session={} shape={{type,session_id,message{{content[]}}}} content_items={} text_len={}",
                session, content_items, text_len
            )
        }
        "result" => {
            let result_len = event["result"].as_str().map_or(0, str::len);
            format!(
                "result session={} shape={{type,session_id,result}} result_len={}",
                session, result_len
            )
        }
        "system" => format!("system session={} shape={{type,session_id}}", session),
        "control_request" => {
            let tool_name = event["request"]["tool_name"].as_str().unwrap_or("-");
            format!(
                "control_request session={} shape={{type,session_id,request_id,request{{subtype,tool_name,description,input}}}} tool_name={}",
                session, tool_name
            )
        }
        other => format!("{other} session={session} shape={{type,session_id,...}}"),
    }
}

fn extract_event_text_len(content: &serde_json::Value) -> usize {
    match content {
        serde_json::Value::String(text) => text.len(),
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                if item["type"].as_str() == Some("text") {
                    item["text"].as_str()
                } else {
                    None
                }
            })
            .map(str::len)
            .sum(),
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::{summarize_event_shape, summarize_events_batch, EventsBody};
    use serde_json::json;

    #[test]
    fn summarize_assistant_event_reports_shape_and_lengths() {
        let event = json!({
            "type": "assistant",
            "session_id": "sess-1",
            "message": {
                "content": [
                    {"type": "text", "text": "hello"},
                    {"type": "tool_use", "name": "edit"}
                ]
            }
        });

        let summary = summarize_event_shape(&event);

        assert!(summary.contains("assistant"));
        assert!(summary.contains("shape={type,session_id,message{content[]}}"));
        assert!(summary.contains("content_items=2"));
        assert!(summary.contains("text_len=5"));
    }

    #[test]
    fn summarize_events_batch_reports_count_and_event_kinds() {
        let body = EventsBody {
            events: vec![
                json!({"type": "system", "session_id": "sess-1"}),
                json!({"type": "result", "session_id": "sess-1", "result": "done"}),
            ],
        };

        let summary = summarize_events_batch(&body);

        assert!(summary.contains("count=2"));
        assert!(summary.contains("system"));
        assert!(summary.contains("result"));
        assert!(summary.contains("shape={type,session_id,result}"));
    }
}
