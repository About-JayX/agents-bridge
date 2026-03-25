use std::collections::VecDeque;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, BufReader},
    sync::mpsc,
};

pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for ch in chars.by_ref() {
                    if ch.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

pub fn parse_verification_uri(line: &str) -> Option<String> {
    line.split_whitespace().find_map(|token| {
        let t = token.trim_matches(|c: char| {
            !c.is_ascii_alphanumeric() && c != ':' && c != '/' && c != '.' && c != '-'
        });
        if t.starts_with("https://") || t.starts_with("http://") {
            Some(t.to_string())
        } else {
            None
        }
    })
}

pub fn find_codex() -> Result<std::path::PathBuf, String> {
    let candidates = ["/Applications/Codex.app/Contents/Resources/codex"];
    for c in &candidates {
        let p = std::path::Path::new(c);
        if p.exists() {
            return Ok(p.to_path_buf());
        }
    }
    if let Some(home) = dirs::home_dir() {
        let p = home.join("Applications/Codex.app/Contents/Resources/codex");
        if p.exists() {
            return Ok(p);
        }
    }
    which::which("codex").map_err(|_| "Codex CLI not found. Please install Codex.".to_string())
}

#[derive(Debug)]
pub enum StreamEvent {
    Line { stream: &'static str, line: String },
    Closed { stream: &'static str },
}

pub struct LoginState {
    pub verification_uri: Option<String>,
    pub stdout_closed: bool,
    pub stderr_closed: bool,
    pub recent_output: VecDeque<String>,
}

impl LoginState {
    pub fn new() -> Self {
        Self {
            verification_uri: None,
            stdout_closed: false,
            stderr_closed: false,
            recent_output: VecDeque::new(),
        }
    }

    pub fn apply(&mut self, event: StreamEvent) {
        match event {
            StreamEvent::Line { stream, line } => {
                let clean = strip_ansi(&line).trim().to_string();
                self.recent_output.push_back(format!("[{stream}] {clean}"));
                while self.recent_output.len() > 24 {
                    self.recent_output.pop_front();
                }
                if self.verification_uri.is_none() {
                    self.verification_uri = parse_verification_uri(&clean);
                }
            }
            StreamEvent::Closed { stream } => match stream {
                "stdout" => self.stdout_closed = true,
                "stderr" => self.stderr_closed = true,
                _ => {}
            },
        }
    }

    pub fn all_closed(&self) -> bool {
        self.stdout_closed && self.stderr_closed
    }
}

pub async fn pump_stream<R>(reader: R, stream: &'static str, tx: mpsc::UnboundedSender<StreamEvent>)
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let _ = tx.send(StreamEvent::Line { stream, line });
            }
            Ok(None) => {
                let _ = tx.send(StreamEvent::Closed { stream });
                break;
            }
            Err(_) => {
                let _ = tx.send(StreamEvent::Closed { stream });
                break;
            }
        }
    }
}
