use crate::types::{BridgeMessage, PermissionRequest, PermissionVerdict};
use std::collections::HashMap;

const ALLOWED_SENDERS: &[&str] = &["user", "system", "lead", "coder", "reviewer", "tester"];
const MAX_CHAT_TARGETS: usize = 1000;

#[derive(Default)]
pub struct ChannelState {
    chat_targets: HashMap<String, String>,
    pending_permissions: HashMap<String, PermissionRequest>,
}

impl ChannelState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn prepare_channel_message(&mut self, msg: &BridgeMessage) -> Option<serde_json::Value> {
        if !ALLOWED_SENDERS.contains(&msg.from.as_str()) {
            eprintln!(
                "[Bridge/channel] dropped message {} from unknown sender {}",
                msg.id, msg.from
            );
            return None;
        }

        let reply_target = if msg.from == "system" {
            "user".to_string()
        } else {
            msg.from.clone()
        };
        self.chat_targets.insert(msg.id.clone(), reply_target);
        if self.chat_targets.len() > MAX_CHAT_TARGETS {
            // Evict oldest entries (HashMap doesn't preserve order, so just clear half)
            let keys: Vec<String> = self
                .chat_targets
                .keys()
                .take(MAX_CHAT_TARGETS / 2)
                .cloned()
                .collect();
            for k in keys {
                self.chat_targets.remove(&k);
            }
        }

        Some(serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/claude/channel",
            "params": {
                "content": msg.content,
                "meta": { "from": msg.from, "chat_id": msg.id }
            }
        }))
    }

    #[cfg(test)]
    pub fn build_reply(&self, chat_id: &str, text: &str, from: &str) -> Option<BridgeMessage> {
        self.rewrite_reply(BridgeMessage {
            id: format!("claude_{}", chrono::Utc::now().timestamp_millis()),
            from: from.to_string(),
            to: chat_id.to_string(),
            content: text.to_string(),
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            reply_to: Some(chat_id.to_string()),
            priority: None,
        })
    }

    pub fn rewrite_reply(&self, mut msg: BridgeMessage) -> Option<BridgeMessage> {
        let chat_id = msg.reply_to.as_deref()?;
        let reply_target = self.chat_targets.get(chat_id)?.clone();
        msg.to = reply_target;
        Some(msg)
    }

    pub fn register_permission(&mut self, request: PermissionRequest) {
        self.pending_permissions
            .insert(request.request_id.clone(), request);
    }

    pub fn permission_notification(
        &mut self,
        verdict: PermissionVerdict,
    ) -> Option<serde_json::Value> {
        self.pending_permissions.remove(&verdict.request_id)?;
        Some(serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/claude/channel/permission",
            "params": {
                "request_id": verdict.request_id,
                "behavior": verdict.behavior,
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::BridgeMessage;

    fn inbound_message(from: &str) -> BridgeMessage {
        BridgeMessage {
            id: "chat-1".into(),
            from: from.into(),
            to: "lead".into(),
            content: "hello".into(),
            timestamp: 1,
            reply_to: None,
            priority: None,
        }
    }

    #[test]
    fn prepare_channel_message_tracks_reply_target() {
        let mut state = ChannelState::new();
        let notif = state
            .prepare_channel_message(&inbound_message("lead"))
            .expect("lead messages should be forwarded to Claude");

        assert_eq!(notif["params"]["meta"]["chat_id"], "chat-1");

        let reply = state
            .build_reply("chat-1", "roger", "claude")
            .expect("reply should resolve back to the original sender");
        assert_eq!(reply.to, "lead");
        assert_eq!(reply.reply_to.as_deref(), Some("chat-1"));
    }

    #[test]
    fn system_messages_reply_to_user() {
        let mut state = ChannelState::new();
        state
            .prepare_channel_message(&inbound_message("system"))
            .expect("system messages should still reach Claude");

        let reply = state
            .build_reply("chat-1", "ack", "claude")
            .expect("system-originated chat should resolve back to the user");
        assert_eq!(reply.to, "user");
    }

    #[test]
    fn reject_unknown_sender_for_channel() {
        let mut state = ChannelState::new();
        assert!(state
            .prepare_channel_message(&inbound_message("intruder"))
            .is_none());
    }
}
