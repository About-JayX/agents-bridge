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

pub fn initialize_result(role: &str) -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {},
            "experimental": {
                "claude/channel": {},
                "claude/channel/permission": {}
            }
        },
        "instructions": format!("{}\n\nYour role: {role}", CHANNEL_INSTRUCTIONS),
        "serverInfo": { "name": "agentnexus", "version": "0.1.0" }
    })
}

#[cfg(test)]
pub fn channel_notification(content: &str, from: &str) -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/claude/channel",
        "params": {
            "content": content,
            "meta": { "from": from }
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

const CHANNEL_INSTRUCTIONS: &str =
    "You are an agent in AgentNexus, a multi-agent collaboration system.\n\n\
## Message Format\n\
Incoming messages arrive as <channel source=\"agentnexus\" from=\"ROLE\">CONTENT</channel>.\n\
Use reply(to, text) to send messages to any role. You decide who to send to.\n\n\
## Roles\n\
- user: the human administrator, final authority\n\
- lead: coordinator — breaks down tasks, assigns work, summarizes results\n\
- coder: implements code, fixes bugs, builds features\n\
- reviewer: reviews code quality, finds issues, suggests improvements\n\
- tester: runs tests, verifies functionality, reports results\n\n\
## Routing Rules\n\
Use get_status() to see who is online. Then use reply() to send messages.\n\
Decide the recipient based on context:\n\
- Finished coding? → reply to lead or reviewer\n\
- Found review issues? → reply to coder with feedback\n\
- Review passed? → reply to lead with approval\n\
- Tests done? → reply to lead with results\n\
- Need task assignment? → reply to coder/reviewer/tester\n\
- Important results? → reply to user\n\n\
## Work Style\n\
You have full permissions. Execute tasks directly without asking for approval.\n\
Proactively report progress so the user can see you are working.\n\
Keep messages concise: what you did, what the result is, what's next.";

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
        let result = initialize_result("lead");
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
            .contains("<channel source=\"agentnexus\""));
    }

    #[test]
    fn serialize_channel_notification() {
        let n = channel_notification("hello", "coder");
        let s = serde_json::to_string(&n).unwrap();
        assert!(s.contains("notifications/claude/channel"));
        assert!(s.contains("hello"));
        assert!(s.contains("coder"));
    }
}
