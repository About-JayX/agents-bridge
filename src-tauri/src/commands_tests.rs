use super::{validate_claude_launch_args, validate_codex_launch_args};

#[test]
fn codex_launch_requires_non_empty_cwd() {
    let err = validate_codex_launch_args("coder", "   ").unwrap_err();
    assert!(err.contains("cwd is required"));
}

#[test]
fn codex_launch_rejects_invalid_role() {
    let err = validate_codex_launch_args("user", "/tmp").unwrap_err();
    assert!(err.contains("invalid role"));
}

#[test]
fn claude_launch_requires_non_empty_cwd() {
    let err = validate_claude_launch_args("lead", "   ").unwrap_err();
    assert!(err.contains("cwd is required"));
}

#[test]
fn claude_launch_rejects_invalid_role() {
    let err = validate_claude_launch_args("user", "/tmp").unwrap_err();
    assert!(err.contains("invalid role"));
}
