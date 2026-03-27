use crate::types::BridgeMessage;
use std::sync::atomic::{AtomicU64, Ordering};

static MSG_SEQ: AtomicU64 = AtomicU64::new(0);

const VALID_REPLY_TARGETS: &[&str] = &["user", "lead", "coder", "reviewer", "tester"];

pub fn reply_tool_schema() -> serde_json::Value {
    serde_json::json!({
        "name": "reply",
        "description": "Send a message to another agent role in AgentNexus. The system routes it automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "enum": VALID_REPLY_TARGETS,
                    "description": "Target role: user, lead, coder, reviewer, or tester"
                },
                "text": {
                    "type": "string",
                    "description": "Message content"
                }
            },
            "required": ["to", "text"]
        }
    })
}

pub fn handle_tool_call(params: &serde_json::Value, from: &str) -> Option<BridgeMessage> {
    let name = params.get("name")?.as_str()?;
    if name != "reply" {
        return None;
    }
    let args = params.get("arguments")?;
    let to = args.get("to")?.as_str()?;
    if !VALID_REPLY_TARGETS.contains(&to) { return None; }
    let text = args.get("text")?.as_str()?;
    if text.trim().is_empty() {
        return None;
    }
    let seq = MSG_SEQ.fetch_add(1, Ordering::Relaxed);
    Some(BridgeMessage {
        id: format!("claude_{}_{seq}", chrono::Utc::now().timestamp_millis()),
        from: from.to_string(),
        to: to.to_string(),
        content: text.to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
        reply_to: None,
        priority: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_schema_uses_to_field() {
        let schema = reply_tool_schema();
        assert!(schema["inputSchema"]["properties"]["to"].is_object());
        assert_eq!(
            schema["inputSchema"]["required"],
            serde_json::json!(["to", "text"])
        );
        // chat_id no longer exists
        assert!(schema["inputSchema"]["properties"]["chat_id"].is_null());
    }

    #[test]
    fn handle_reply_tool() {
        let params = serde_json::json!({
            "name": "reply",
            "arguments": { "to": "lead", "text": "hello" }
        });
        let msg = handle_tool_call(&params, "coder").unwrap();
        assert_eq!(msg.to, "lead");
        assert_eq!(msg.content, "hello");
        assert_eq!(msg.from, "coder");
    }

    #[test]
    fn unknown_tool_returns_none() {
        let params = serde_json::json!({ "name": "unknown", "arguments": {} });
        assert!(handle_tool_call(&params, "claude").is_none());
    }

    #[test]
    fn invalid_target_rejected() {
        let params = serde_json::json!({
            "name": "reply",
            "arguments": { "to": "admin", "text": "hello" }
        });
        assert!(handle_tool_call(&params, "coder").is_none());
    }

    #[test]
    fn empty_reply_text_rejected() {
        let params = serde_json::json!({
            "name": "reply",
            "arguments": { "to": "lead", "text": "" }
        });
        assert!(handle_tool_call(&params, "coder").is_none());
    }

    #[test]
    fn whitespace_only_reply_text_rejected() {
        let params = serde_json::json!({
            "name": "reply",
            "arguments": { "to": "lead", "text": " \n\t " }
        });
        assert!(handle_tool_call(&params, "coder").is_none());
    }

    #[test]
    fn reply_schema_has_enum_constraint() {
        let schema = reply_tool_schema();
        let to_enum = &schema["inputSchema"]["properties"]["to"]["enum"];
        assert!(to_enum.is_array());
        let targets: Vec<&str> = to_enum.as_array().unwrap()
            .iter().map(|v| v.as_str().unwrap()).collect();
        assert!(targets.contains(&"user"));
        assert!(targets.contains(&"lead"));
        assert!(!targets.contains(&"admin"));
    }
}
