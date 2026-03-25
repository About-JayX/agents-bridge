use crate::types::PermissionRequest;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum RpcId {
    Number(i64),
    Str(String),
}

#[derive(Debug, Deserialize)]
pub struct RpcMessage {
    pub id: Option<RpcId>,
    pub method: Option<String>,
    pub params: Option<serde_json::Value>,
}

pub fn id_to_value(id: &Option<RpcId>) -> serde_json::Value {
    match id {
        Some(RpcId::Number(n)) => serde_json::json!(n),
        Some(RpcId::Str(s)) => serde_json::json!(s),
        None => serde_json::Value::Null,
    }
}

pub fn initialize_result() -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {},
            "experimental": {
                "claude/channel": {},
                "claude/channel/permission": {}
            }
        },
        "instructions": channel_instructions(),
        "serverInfo": { "name": "agentbridge", "version": "0.1.0" }
    })
}

#[cfg(test)]
pub fn channel_notification(content: &str, chat_id: &str, from: &str) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/claude/channel",
        "params": {
            "content": content,
            "meta": { "from": from, "chat_id": chat_id }
        }
    })
}

pub fn parse_permission_request(params: &serde_json::Value) -> Option<PermissionRequest> {
    Some(PermissionRequest {
        request_id: params.get("request_id")?.as_str()?.to_string(),
        tool_name: params.get("tool_name")?.as_str()?.to_string(),
        description: params.get("description")?.as_str()?.to_string(),
        input_preview: params
            .get("input_preview")
            .and_then(|value| value.as_str().map(str::to_string)),
    })
}

fn channel_instructions() -> &'static str {
    "Incoming AgentBridge messages arrive as <channel source=\"agentbridge\" from=\"...\" chat_id=\"...\">...</channel> events. \
Reply with the reply tool and pass the same chat_id back unchanged. \
When Claude requests permission, AgentBridge relays the request to the desktop UI and sends the verdict back over notifications/claude/channel/permission."
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_initialize_request() {
        let raw = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"claude-code","version":"1.0"}}}"#;
        let msg: RpcMessage = serde_json::from_str(raw).unwrap();
        assert_eq!(msg.method.as_deref(), Some("initialize"));
        assert!(matches!(msg.id, Some(RpcId::Number(1))));
    }

    #[test]
    fn parse_tools_list_request() {
        let raw = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#;
        let msg: RpcMessage = serde_json::from_str(raw).unwrap();
        assert_eq!(msg.method.as_deref(), Some("tools/list"));
    }

    #[test]
    fn initialize_result_includes_instructions_and_permission_capability() {
        let result = initialize_result();
        assert_eq!(
            result["capabilities"]["experimental"]["claude/channel"],
            serde_json::json!({})
        );
        assert_eq!(
            result["capabilities"]["experimental"]["claude/channel/permission"],
            serde_json::json!({})
        );
        assert!(result["instructions"]
            .as_str()
            .unwrap_or_default()
            .contains("<channel source=\"agentbridge\""));
    }

    #[test]
    fn serialize_channel_notification() {
        let n = channel_notification("hello", "msg-1", "coder");
        let s = serde_json::to_string(&n).unwrap();
        assert!(s.contains("notifications/claude/channel"));
        assert!(s.contains("hello"));
        assert!(s.contains("coder"));
    }
}
