use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

/// Account profile extracted from ~/.codex/auth.json JWT.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CodexProfile {
    pub email: Option<String>,
    pub name: Option<String>,
    pub plan_type: Option<String>,
    pub account_id: Option<String>,
    pub user_id: Option<String>,
    pub org_title: Option<String>,
    pub subscription_active_until: Option<String>,
}

pub fn auth_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("auth.json"))
}

pub fn read_profile() -> Result<CodexProfile, String> {
    let path = auth_path().ok_or("cannot resolve home directory")?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {}", path.display(), e))?;
    let auth: Value = serde_json::from_str(&raw).map_err(|e| format!("invalid auth.json: {e}"))?;

    let id_token = auth
        .pointer("/tokens/id_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let account_id = auth
        .pointer("/tokens/account_id")
        .and_then(|v| v.as_str())
        .map(String::from);

    if id_token.is_empty() {
        return Ok(CodexProfile {
            account_id,
            ..Default::default()
        });
    }

    let payload = decode_jwt_payload(id_token)?;

    let auth_ns = payload.get("https://api.openai.com/auth");

    let orgs = auth_ns
        .and_then(|v| v.get("organizations"))
        .and_then(|v| v.as_array());
    let default_org = orgs.and_then(|arr| {
        arr.iter()
            .find(|o| o.get("is_default").and_then(|v| v.as_bool()).unwrap_or(false))
            .or(arr.first())
    });

    Ok(CodexProfile {
        email: payload.get("email").and_then(|v| v.as_str()).map(String::from),
        name: payload.get("name").and_then(|v| v.as_str()).map(String::from),
        plan_type: auth_ns
            .and_then(|v| v.get("chatgpt_plan_type"))
            .and_then(|v| v.as_str())
            .map(String::from),
        account_id: auth_ns
            .and_then(|v| v.get("chatgpt_account_id"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .or(account_id),
        user_id: auth_ns
            .and_then(|v| v.get("chatgpt_user_id"))
            .and_then(|v| v.as_str())
            .map(String::from),
        org_title: default_org
            .and_then(|o| o.get("title"))
            .and_then(|v| v.as_str())
            .map(String::from),
        subscription_active_until: auth_ns
            .and_then(|v| v.get("chatgpt_subscription_active_until"))
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

pub fn read_access_token() -> Option<String> {
    let path = auth_path()?;
    let raw = std::fs::read_to_string(path).ok()?;
    let auth: Value = serde_json::from_str(&raw).ok()?;
    auth.pointer("/tokens/access_token")
        .and_then(|v| v.as_str())
        .map(String::from)
}

fn decode_jwt_payload(token: &str) -> Result<Value, String> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() < 2 {
        return Err("invalid JWT format".into());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("JWT payload parse failed: {e}"))
}
