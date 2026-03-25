use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
};
use tauri::AppHandle;

const CHANNEL_MARKER: &str = "channels: server:agentbridge";
const LOCAL_DEV_OPTION: &str = "1. i am using this for local development";
const CHANNELS_HINT: &str = "please use --channels to run a list of approved channels.";
const CHANNEL_MARKER_COMPACT: &str = "channels:server:agentbridge";
const LOCAL_DEV_OPTION_COMPACT: &str = "iamusingthisforlocaldevelopment";
const CHANNELS_HINT_COMPACT: &str = "pleaseuse--channelstorunalistofapprovedchannels.";

pub fn spawn_auto_confirm_thread(
    mut reader: Box<dyn Read + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    app: AppHandle,
    emit_debug_logs: bool,
) {
    let _ = std::thread::Builder::new()
        .name("claude-pty-watch".into())
        .spawn(move || {
            let mut buf = [0_u8; 1024];
            let mut transcript = String::new();
            let mut pending_log = String::new();
            let mut confirmed = false;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]);
                        crate::daemon::gui::emit_claude_terminal_data(&app, &chunk);
                        transcript.push_str(&chunk);
                        trim_transcript(&mut transcript, 8192);
                        if emit_debug_logs {
                            for line in drain_log_lines(&mut pending_log, &chunk) {
                                if !line.is_empty() {
                                    crate::daemon::gui::emit_system_log(
                                        &app,
                                        "info",
                                        &format!("[Claude PTY] {line}"),
                                    );
                                }
                            }
                        }
                        // Check for prompts needing user attention
                        if needs_user_attention(&transcript) {
                            crate::daemon::gui::emit_claude_terminal_attention(&app);
                        }
                        if confirmed || !should_auto_confirm_development_prompt(&transcript) {
                            continue;
                        }
                        if let Ok(mut tty) = writer.lock() {
                            if tty.write_all(b"1\n").and_then(|_| tty.flush()).is_ok() {
                                confirmed = true;
                                eprintln!(
                                    "[Claude] auto-confirmed local server:agentbridge prompt"
                                );
                                if emit_debug_logs {
                                    crate::daemon::gui::emit_system_log(
                                        &app,
                                        "info",
                                        "[Claude PTY] auto-confirmed local server:agentbridge prompt",
                                    );
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });
}

fn trim_transcript(text: &mut String, keep: usize) {
    let char_len = text.chars().count();
    if char_len <= keep {
        return;
    }
    let drop_chars = char_len - keep;
    let split_idx = text
        .char_indices()
        .nth(drop_chars)
        .map(|(idx, _)| idx)
        .unwrap_or(0);
    *text = text[split_idx..].to_owned();
}

pub fn should_auto_confirm_development_prompt(output: &str) -> bool {
    let normalized = normalize_prompt_text(output);
    let compact = normalize_prompt_compact_text(output);

    let has_hint = normalized.contains(CHANNELS_HINT) || compact.contains(CHANNELS_HINT_COMPACT);
    let has_channel = normalized.contains(CHANNEL_MARKER) || compact.contains(CHANNEL_MARKER_COMPACT);
    let has_local_dev =
        normalized.contains(LOCAL_DEV_OPTION) || compact.contains(LOCAL_DEV_OPTION_COMPACT);

    has_hint && has_channel && has_local_dev
}

pub fn drain_log_lines(pending: &mut String, chunk: &str) -> Vec<String> {
    pending.push_str(chunk);
    let normalized = strip_ansi(pending).replace('\r', "\n");
    let mut parts = normalized.split('\n').map(str::to_string).collect::<Vec<_>>();
    let tail = parts.pop().unwrap_or_default();
    *pending = tail;
    parts.into_iter()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

/// Detect interactive prompts that need manual user input.
/// Looks for numbered options, y/n questions, or "?" prompts.
/// Excludes the auto-confirmed development channel prompt.
fn needs_user_attention(transcript: &str) -> bool {
    let clean = strip_ansi(transcript);
    // Only check the last ~500 chars (recent output)
    let tail = if clean.len() > 500 { &clean[clean.len() - 500..] } else { &clean };
    let lower = tail.to_ascii_lowercase();
    // Skip if this is the agentbridge auto-confirm prompt
    if lower.contains("server:agentbridge") && lower.contains("local development") {
        return false;
    }
    // Detect numbered options like "1.", "2." at line start
    let has_options = tail.lines().any(|l| {
        let t = l.trim();
        t.starts_with("1.") || t.starts_with("2.") || t.starts_with("1)")
    });
    // Detect y/n prompts
    let has_yn = lower.contains("(y/n)") || lower.contains("[y/n]")
        || lower.contains("(yes/no)") || lower.contains("[yes/no]");
    // Detect question at end of recent line
    let has_question = tail.lines().rev().take(3).any(|l| l.trim().ends_with('?'));
    has_options || has_yn || has_question
}

fn normalize_prompt_text(raw: &str) -> String {
    strip_ansi(raw)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn normalize_prompt_compact_text(raw: &str) -> String {
    strip_ansi(raw)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn strip_ansi(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                chars.next();
                for esc in chars.by_ref() {
                    if ('@'..='~').contains(&esc) {
                        break;
                    }
                }
                continue;
            }
            continue;
        }
        out.push(ch);
    }

    out
}

#[cfg(test)]
#[path = "prompt_tests.rs"]
mod prompt_tests;
