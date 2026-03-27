use serde_json::Value;

#[derive(Default)]
pub(super) struct StreamPreviewState {
    raw_delta: String,
    last_preview: String,
}

impl StreamPreviewState {
    pub(super) fn reset(&mut self) {
        self.raw_delta.clear();
        self.last_preview.clear();
    }

    pub(super) fn ingest_delta(&mut self, text: &str) -> Option<String> {
        self.raw_delta.push_str(text);
        let preview = extract_structured_message_preview(&self.raw_delta)?;
        if preview == self.last_preview {
            return None;
        }
        self.last_preview = preview.clone();
        Some(preview)
    }

    pub(super) fn sync_final_raw(&mut self, raw: &str) {
        self.raw_delta.clear();
        self.raw_delta.push_str(raw);
    }
}

/// Parse Codex structured output `{ "message": "...", "send_to": "..." }`.
/// Falls back to raw text if not valid JSON.
pub(super) fn parse_structured_output(raw: &str) -> (String, Option<String>) {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        let message = v["message"].as_str().unwrap_or(raw).to_string();
        let send_to = v["send_to"].as_str().map(|s| s.to_string());
        (message, send_to)
    } else {
        (raw.to_string(), None)
    }
}

pub(super) fn should_emit_final_message(text: &str) -> bool {
    !text.trim().is_empty()
}

fn extract_structured_message_preview(raw: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        let message = v["message"].as_str().unwrap_or("").to_string();
        return should_emit_final_message(&message).then_some(message);
    }

    if !raw.trim_start().starts_with('{') {
        return should_emit_final_message(raw).then_some(raw.to_string());
    }

    let start = find_message_value_start(raw)?;
    let preview = decode_partial_json_string(&raw[start..]);
    should_emit_final_message(&preview).then_some(preview)
}

fn find_message_value_start(raw: &str) -> Option<usize> {
    let key_idx = raw.find("\"message\"")?;
    let mut idx = key_idx + "\"message\"".len();
    while let Some(ch) = raw[idx..].chars().next() {
        if ch.is_whitespace() {
            idx += ch.len_utf8();
            continue;
        }
        if ch == ':' {
            idx += ch.len_utf8();
            break;
        }
        return None;
    }
    while let Some(ch) = raw[idx..].chars().next() {
        if ch.is_whitespace() {
            idx += ch.len_utf8();
            continue;
        }
        if ch == '"' {
            return Some(idx + ch.len_utf8());
        }
        return None;
    }
    None
}

fn decode_partial_json_string(raw: &str) -> String {
    let mut out = String::new();
    let mut chars = raw.chars();
    let mut escaping = false;

    while let Some(ch) = chars.next() {
        if escaping {
            match ch {
                '"' => out.push('"'),
                '\\' => out.push('\\'),
                '/' => out.push('/'),
                'b' => out.push('\u{0008}'),
                'f' => out.push('\u{000c}'),
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'u' => {
                    let mut hex = String::new();
                    for _ in 0..4 {
                        let Some(next) = chars.next() else {
                            return out;
                        };
                        hex.push(next);
                    }
                    if let Ok(code) = u32::from_str_radix(&hex, 16) {
                        if let Some(decoded) = char::from_u32(code) {
                            out.push(decoded);
                        }
                    }
                }
                _ => out.push(ch),
            }
            escaping = false;
            continue;
        }

        match ch {
            '\\' => escaping = true,
            '"' => break,
            _ => out.push(ch),
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::{
        extract_structured_message_preview, parse_structured_output,
        should_emit_final_message,
    };

    #[test]
    fn preview_extracts_message_from_complete_json() {
        let raw = r#"{"message":"Hello world","send_to":"none"}"#;
        assert_eq!(
            extract_structured_message_preview(raw),
            Some("Hello world".to_string())
        );
    }

    #[test]
    fn preview_extracts_partial_message_without_showing_json_wrapper() {
        let raw = r#"{"message":"Hello wor"#;
        assert_eq!(
            extract_structured_message_preview(raw),
            Some("Hello wor".to_string())
        );
    }

    #[test]
    fn preview_decodes_basic_escape_sequences() {
        let raw = r#"{"message":"line 1\nline 2\tok"#;
        assert_eq!(
            extract_structured_message_preview(raw),
            Some("line 1\nline 2\tok".to_string())
        );
    }

    #[test]
    fn preview_is_none_before_message_field_appears() {
        let raw = r#"{"send_to":"lead"}"#;
        assert_eq!(extract_structured_message_preview(raw), None);
    }

    #[test]
    fn final_empty_message_is_not_emitted() {
        let (display_text, send_to) =
            parse_structured_output(r#"{"message":"   ","send_to":"lead"}"#);
        assert_eq!(send_to.as_deref(), Some("lead"));
        assert!(!should_emit_final_message(&display_text));
    }
}
