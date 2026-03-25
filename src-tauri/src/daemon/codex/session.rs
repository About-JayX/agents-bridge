use crate::daemon::codex::handler;
use crate::daemon::{gui, SharedState};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub struct SessionOpts {
    pub role_id: String,
    pub cwd: String,
    pub model: Option<String>,
    pub sandbox_mode: Option<String>,
    pub developer_instructions: Option<String>,
}

/// Connect to a running Codex app-server, initialize the session, and enter
/// the event loop.  Sends the thread ID on `ready_tx` after successful handshake,
/// or empty string on failure.
pub async fn run(
    port: u16,
    opts: SessionOpts,
    state: SharedState,
    app: AppHandle,
    mut inject_rx: mpsc::Receiver<String>,
    ready_tx: tokio::sync::oneshot::Sender<String>,
) {
    match handshake(port, &opts, &app).await {
        Some((tid, ws_tx, stream)) => {
            let _ = ready_tx.send(tid.clone());
            event_loop(tid, &opts.role_id, &state, &app, &mut inject_rx, ws_tx, stream).await;
        }
        None => { let _ = ready_tx.send(String::new()); }
    }
}

type WsStream = futures_util::stream::SplitStream<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
>;
type WsTx = mpsc::Sender<String>;

async fn handshake(
    port: u16, opts: &SessionOpts, app: &AppHandle,
) -> Option<(String, WsTx, WsStream)> {
    let url = format!("ws://127.0.0.1:{port}");
    let ws = match connect_async(&url).await {
        Ok((ws, _)) => ws,
        Err(e) => {
            gui::emit_system_log(app, "error", &format!("[Codex] connect failed: {e}"));
            return None;
        }
    };

    let (mut sink, mut stream) = ws.split();
    let (ws_tx, mut ws_rx) = mpsc::channel::<String>(64);

    tokio::spawn(async move {
        while let Some(text) = ws_rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() { break; }
        }
    });

    // === initialize ===
    let mut next_id: u64 = 1;
    let init_id = next_id;
    next_id += 1;
    if ws_tx.send(json!({
        "method": "initialize", "id": init_id,
        "params": { "clientInfo": {"name":"agentbridge","version":"0.1.0"},
                    "capabilities": {"experimentalApi": true} }
    }).to_string()).await.is_err() {
        gui::emit_system_log(app, "error", "[Codex] failed to send initialize");
        return None;
    }

    if !wait_for_id(&mut stream, init_id, 30).await {
        gui::emit_system_log(app, "error", "[Codex] initialize timed out");
        return None;
    }
    if ws_tx.send(json!({"method":"initialized","params":{}}).to_string()).await.is_err() {
        return None;
    }

    // === thread/start ===
    let thread_id_rpc = next_id;
    // NOTE: Codex CLI uses `inputSchema` (not `parameters`) and kebab-case sandbox.
    // Verified by runtime testing 2026-03-25.
    let mut params = json!({
        "dynamicTools": [
            { "name": "reply", "description": "Send a message to another agent role.",
              "inputSchema": {"type":"object","properties":{"to":{"type":"string"},"text":{"type":"string"}},"required":["to","text"]} },
            { "name": "check_messages", "description": "Check for new messages from other agents.",
              "inputSchema": {"type":"object","properties":{}} },
            { "name": "get_status", "description": "Get AgentBridge status: available roles and online agents.",
              "inputSchema": {"type":"object","properties":{}} }
        ]
    });
    if let Some(cwd) = (!opts.cwd.is_empty()).then(|| opts.cwd.as_str()) {
        params["cwd"] = json!(cwd);
    }
    if let Some(m) = &opts.model {
        if !m.is_empty() { params["model"] = json!(m); }
    }
    if let Some(sb) = &opts.sandbox_mode { params["sandbox"] = json!(sb); }
    if let Some(di) = opts.developer_instructions.as_deref().filter(|s| !s.is_empty()) {
        params["settings"] = json!({"developer_instructions": di});
    }
    if ws_tx.send(json!({"method":"thread/start","id":thread_id_rpc,"params":params}).to_string())
        .await.is_err()
    {
        gui::emit_system_log(app, "error", "[Codex] failed to send thread/start");
        return None;
    }

    let thread_result = timeout(Duration::from_secs(30), async {
        loop {
            let Some(Ok(msg)) = stream.next().await else { return String::new() };
            let Ok(v) = serde_json::from_str::<Value>(&msg.to_text().unwrap_or("")) else { continue };
            if v["id"].as_u64() == Some(thread_id_rpc) {
                if v.get("error").is_some() {
                    let err = serde_json::to_string(&v["error"]).unwrap_or_default();
                    eprintln!("[Codex] thread/start error: {err}");
                }
                if let Some(tid) = v["result"]["thread"]["id"].as_str() {
                    return tid.to_string();
                }
                return String::new();
            }
        }
    }).await;

    match thread_result {
        Ok(tid) if !tid.is_empty() => {
            gui::emit_system_log(app, "info", &format!("[Codex] thread={tid}"));
            Some((tid, ws_tx, stream))
        }
        Ok(_) => {
            gui::emit_system_log(app, "error", "[Codex] failed to start thread");
            None
        }
        Err(_) => {
            gui::emit_system_log(app, "error", "[Codex] thread/start timed out");
            None
        }
    }
}

/// Main event loop after successful handshake.
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
                let Ok(v) = serde_json::from_str::<Value>(&msg.to_text().unwrap_or("")) else { continue };
                if v["method"].as_str() == Some("item/tool/call") {
                    if let (Some(id), Some(name)) = (v["id"].as_u64(), v["params"]["name"].as_str()) {
                        let args = v["params"]["arguments"].clone();
                        handler::handle_dynamic_tool(id, name, &args, role_id, state, app, &ws_tx).await;
                    }
                }
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

async fn wait_for_id(stream: &mut WsStream, expected_id: u64, secs: u64) -> bool {
    timeout(Duration::from_secs(secs), async {
        loop {
            let Some(Ok(msg)) = stream.next().await else { return false };
            let Ok(v) = serde_json::from_str::<Value>(&msg.to_text().unwrap_or("")) else { continue };
            if v["id"].as_u64() == Some(expected_id) { return true; }
        }
    }).await.unwrap_or(false)
}
