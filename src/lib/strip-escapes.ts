/**
 * Strip ANSI/OSC escape sequences and stray control chars from text.
 *
 * Matches the Rust `strip_ansi()` implementation in
 * `src-tauri/src/claude_session/text_utils.rs`.
 */
export function stripEscapes(text: string): string {
  return (
    text
      // CSI sequences: ESC [ ... <final byte 0x40-0x7E>
      .replace(/\x1b\[[0-9;]*[@-~]/g, "")
      // OSC sequences: ESC ] ... (BEL | ESC \)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      // Remaining lone ESC + next char
      .replace(/\x1b./g, "")
      // Stray control chars (keep \n \r \t)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
  );
}
