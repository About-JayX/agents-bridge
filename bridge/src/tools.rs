use crate::types::BridgeMessage;

pub fn reply_tool_schema() -> serde_json::Value {
    serde_json::json!({
        "name": "reply",
        "description": "Reply to an AgentBridge channel message using the original chat_id.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "chat_id": {
                    "type": "string",
                    "description": "chat_id from the incoming <channel ...> event"
                },
                "text": {
                    "type": "string",
                    "description": "Message content"
                }
            },
            "required": ["chat_id", "text"]
        }
    })
}

pub fn handle_tool_call(params: &serde_json::Value, from: &str) -> Option<BridgeMessage> {
    let name = params.get("name")?.as_str()?;
    if name != "reply" {
        return None;
    }
    let args = params.get("arguments")?;
    let chat_id = args.get("chat_id")?.as_str()?;
    let text = args.get("text")?.as_str()?;
    Some(BridgeMessage {
        id: format!("claude_{}", chrono::Utc::now().timestamp_millis()),
        from: from.to_string(),
        to: chat_id.to_string(),
        content: text.to_string(),
        timestamp: chrono::Utc::now().timestamp_millis() as u64,
        reply_to: Some(chat_id.to_string()),
        priority: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_schema_uses_chat_id_contract() {
        let schema = reply_tool_schema();
        assert!(schema["inputSchema"]["properties"]["chat_id"].is_object());
        assert_eq!(
            schema["inputSchema"]["required"],
            serde_json::json!(["chat_id", "text"])
        );
        assert!(schema["inputSchema"]["properties"]["to"].is_null());
    }

    #[test]
    fn handle_reply_tool() {
        let params = serde_json::json!({
            "name": "reply",
            "arguments": { "chat_id": "chat-1", "text": "hello" }
        });
        let msg = handle_tool_call(&params, "coder").unwrap();
        assert_eq!(msg.reply_to.as_deref(), Some("chat-1"));
        assert_eq!(msg.content, "hello");
        assert_eq!(msg.from, "coder");
    }

    #[test]
    fn unknown_tool_returns_none() {
        let params = serde_json::json!({ "name": "unknown", "arguments": {} });
        assert!(handle_tool_call(&params, "claude").is_none());
    }
}
