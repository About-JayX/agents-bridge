pub fn tail_chars(text: &str, keep: usize) -> &str {
    let char_len = text.chars().count();
    if char_len <= keep {
        return text;
    }
    let drop_chars = char_len - keep;
    let split_idx = text
        .char_indices()
        .nth(drop_chars)
        .map(|(idx, _)| idx)
        .unwrap_or(0);
    &text[split_idx..]
}

pub fn normalize_prompt_text(raw: &str) -> String {
    strip_ansi(raw)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

pub fn normalize_prompt_compact_text(raw: &str) -> String {
    strip_ansi(raw)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase()
}

pub fn strip_ansi(raw: &str) -> String {
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

pub fn extract_terminal_preview(raw: &str) -> Option<String> {
    let normalized = normalize_terminal_lines(raw);
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();

    for line in normalized.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
            continue;
        }
        if is_terminal_chrome_line(trimmed) || is_box_drawing_only(trimmed) {
            continue;
        }
        current.push(trimmed.to_string());
    }

    if !current.is_empty() {
        blocks.push(current);
    }

    blocks
        .into_iter()
        .rev()
        .find(|block| !block.is_empty())
        .map(|block| block.join("\n"))
}

fn normalize_terminal_lines(raw: &str) -> String {
    let clean = strip_ansi(raw);
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();

    for ch in clean.chars() {
        match ch {
            '\r' => current.clear(),
            '\n' => {
                lines.push(current.clone());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        lines.push(current);
    }

    lines.join("\n")
}

fn is_terminal_chrome_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("esc to interrupt")
        || lower.starts_with("press esc")
        || lower.starts_with("ctrl+c to exit")
        || lower.starts_with("claude terminal exited")
        || lower.starts_with("[agentbridge]")
}

fn is_box_drawing_only(line: &str) -> bool {
    line.chars().all(|ch| {
        ch.is_whitespace()
            || matches!(
                ch,
                '│'
                    | '─'
                    | '╭'
                    | '╮'
                    | '╰'
                    | '╯'
                    | '┌'
                    | '┐'
                    | '└'
                    | '┘'
                    | '├'
                    | '┤'
                    | '┬'
                    | '┴'
                    | '┼'
                    | '═'
                    | '║'
                    | '╔'
                    | '╗'
                    | '╚'
                    | '╝'
                    | '╠'
                    | '╣'
                    | '╦'
                    | '╩'
                    | '╬'
            )
    })
}
