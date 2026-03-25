use crate::channel_state::ChannelState;
use crate::mcp_protocol::{id_to_value, initialize_result, parse_permission_request, RpcMessage};
use crate::tools::handle_tool_call;
use crate::types::{BridgeOutbound, DaemonInbound};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub async fn run(
    agent_id: String,
    mut push_rx: tokio::sync::mpsc::Receiver<DaemonInbound>,
    reply_tx: tokio::sync::mpsc::Sender<BridgeOutbound>,
) {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin);
    let mut writer = tokio::io::BufWriter::new(stdout);
    let mut initialized = false;
    let mut channel_state = ChannelState::new();

    loop {
        let mut line = String::new();
        tokio::select! {
            n = reader.read_line(&mut line) => {
                if n.unwrap_or(0usize) == 0 { break; }
                let trimmed = line.trim();
                if trimmed.is_empty() { continue; }
                let Ok(msg) = serde_json::from_str::<RpcMessage>(trimmed) else { continue };
                handle_rpc_message(
                    &agent_id,
                    &mut initialized,
                    &mut channel_state,
                    &mut writer,
                    &reply_tx,
                    msg,
                ).await;
            }
            Some(inbound) = push_rx.recv() => {
                if !initialized {
                    continue;
                }
                handle_daemon_inbound(&agent_id, &mut channel_state, &mut writer, inbound).await;
            }
        }
    }
}

async fn handle_rpc_message(
    agent_id: &str,
    initialized: &mut bool,
    channel_state: &mut ChannelState,
    writer: &mut tokio::io::BufWriter<tokio::io::Stdout>,
    reply_tx: &tokio::sync::mpsc::Sender<BridgeOutbound>,
    msg: RpcMessage,
) {
    match msg.method.as_deref() {
        Some("initialize") => {
            *initialized = true;
            eprintln!("[Bridge/{agent_id}] MCP initialize complete");
            let resp = serde_json::json!({
                "jsonrpc": "2.0",
                "id": id_to_value(&msg.id),
                "result": initialize_result()
            });
            write_line(writer, &resp).await;
        }
        Some("tools/list") => {
            let resp = serde_json::json!({
                "jsonrpc": "2.0",
                "id": id_to_value(&msg.id),
                "result": { "tools": [crate::tools::reply_tool_schema()] }
            });
            write_line(writer, &resp).await;
        }
        Some("tools/call") => {
            let resp = tool_call_response(agent_id, channel_state, reply_tx, &msg).await;
            write_line(writer, &resp).await;
        }
        Some("notifications/claude/channel/permission_request") => {
            if let Some(request) = msg.params.as_ref().and_then(parse_permission_request) {
                eprintln!(
                    "[Bridge/{agent_id}] permission request {} for {}",
                    request.request_id, request.tool_name
                );
                channel_state.register_permission(request.clone());
                let _ = reply_tx
                    .send(BridgeOutbound::PermissionRequest(request))
                    .await;
            }
        }
        Some("notifications/initialized") | None => {}
        _ => {}
    }
}

async fn tool_call_response(
    agent_id: &str,
    channel_state: &mut ChannelState,
    reply_tx: &tokio::sync::mpsc::Sender<BridgeOutbound>,
    msg: &RpcMessage,
) -> serde_json::Value {
    match msg
        .params
        .as_ref()
        .and_then(|params| handle_tool_call(params, agent_id))
        .and_then(|bridge_msg| channel_state.rewrite_reply(bridge_msg))
    {
        Some(bridge_msg) => {
            eprintln!(
                "[Bridge/{agent_id}] reply tool -> {} (reply_to={:?})",
                bridge_msg.to, bridge_msg.reply_to
            );
            match reply_tx.send(BridgeOutbound::AgentReply(bridge_msg)).await {
                Ok(()) => serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id_to_value(&msg.id),
                    "result": { "content": [{ "type": "text", "text": "sent" }] }
                }),
                Err(_) => serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id_to_value(&msg.id),
                    "error": { "code": -32001, "message": "bridge outbound channel is closed" }
                }),
            }
        }
        None => serde_json::json!({
            "jsonrpc": "2.0",
            "id": id_to_value(&msg.id),
            "error": { "code": -32000, "message": "unknown chat_id or unsupported tool call" }
        }),
    }
}

async fn handle_daemon_inbound(
    agent_id: &str,
    channel_state: &mut ChannelState,
    writer: &mut tokio::io::BufWriter<tokio::io::Stdout>,
    inbound: DaemonInbound,
) {
    let payload = match inbound {
        DaemonInbound::RoutedMessage(msg) => {
            let notif = channel_state.prepare_channel_message(&msg);
            if notif.is_some() {
                eprintln!(
                    "[Bridge/{agent_id}] channel event {} from {}",
                    msg.id, msg.from
                );
            }
            notif
        }
        DaemonInbound::PermissionVerdict(verdict) => {
            let notif = channel_state.permission_notification(verdict.clone());
            if notif.is_some() {
                eprintln!(
                    "[Bridge/{agent_id}] permission verdict {} -> {:?}",
                    verdict.request_id, verdict.behavior
                );
            }
            notif
        }
    };

    if let Some(notif) = payload {
        write_line(writer, &notif).await;
    }
}

async fn write_line(w: &mut tokio::io::BufWriter<tokio::io::Stdout>, val: &serde_json::Value) {
    let mut line = serde_json::to_string(val).unwrap();
    line.push('\n');
    let _ = w.write_all(line.as_bytes()).await;
    let _ = w.flush().await;
}
