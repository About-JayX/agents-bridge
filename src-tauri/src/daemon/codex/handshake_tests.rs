use super::build_thread_start_params;
use crate::daemon::codex::session::SessionOpts;

#[test]
fn thread_start_params_include_reasoning_effort_when_present() {
    let params = build_thread_start_params(&SessionOpts {
        role_id: "coder".into(),
        cwd: "/tmp/project".into(),
        model: Some("gpt-5.4".into()),
        effort: Some("xhigh".into()),
        sandbox_mode: Some("workspace-write".into()),
        base_instructions: Some("follow role".into()),
    });

    assert_eq!(params["cwd"], "/tmp/project");
    assert_eq!(params["model"], "gpt-5.4");
    assert_eq!(params["effort"], "xhigh");
    assert_eq!(params["sandbox"], "workspace-write");
    assert_eq!(params["baseInstructions"], "follow role");
}

#[test]
fn thread_start_params_omit_reasoning_effort_when_absent() {
    let params = build_thread_start_params(&SessionOpts {
        role_id: "coder".into(),
        cwd: "/tmp/project".into(),
        model: Some("gpt-5.4".into()),
        effort: None,
        sandbox_mode: Some("workspace-write".into()),
        base_instructions: Some("follow role".into()),
    });

    assert_eq!(params["cwd"], "/tmp/project");
    assert_eq!(params["model"], "gpt-5.4");
    assert!(params.get("effort").is_none());
    assert_eq!(params["sandbox"], "workspace-write");
}
