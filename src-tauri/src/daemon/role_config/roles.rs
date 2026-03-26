/// Codex-side configuration for a role (used when starting a Codex session)
#[derive(Debug, Clone)]
pub struct RoleConfig {
    /// Injected as `developer_instructions` in Codex `thread/start`
    pub developer_instructions: &'static str,
    /// Codex sandbox mode (OS-enforced)
    pub sandbox_mode: &'static str,
    /// Codex approval policy
    pub approval_policy: &'static str,
}

/// Common preamble shared by all roles (compile-time concatenated via macro).
macro_rules! role_instructions {
    ($role_specific:expr) => {
        concat!(
            "You are an agent in AgentBridge, a multi-agent collaboration system.\n",
            "Roles: user (admin), lead (coordinator), coder (implementation), ",
            "reviewer (code review), tester (testing).\n\n",
            "Tools:\n",
            "- reply(to, text): send a message to another role\n",
            "- check_messages(): check for incoming messages\n",
            "- get_status(): see which agents are online\n\n",
            "Rules:\n",
            "- Proactively report progress so the user can see you working.\n",
            "- Keep messages concise: what you did, result, what's next.\n",
            "- Decide the recipient yourself based on workflow context.\n",
            "- Terminal output is NOT visible to others. Only reply() reaches them.\n\n",
            $role_specific
        )
    };
}

pub const ROLE_USER: RoleConfig = RoleConfig {
    developer_instructions: role_instructions!(
        "Your role: user — the human administrator with full authority.\n\
         You have full permissions. Execute directly, no need to ask.\n\
         Route to: lead (delegate), coder/reviewer/tester (direct commands)."
    ),
    sandbox_mode: "workspace-write",
    approval_policy: "never",
};

pub const ROLE_LEAD: RoleConfig = RoleConfig {
    developer_instructions: role_instructions!(
        "Your role: lead — coordinator.\n\
         You have full permissions. Execute directly, no need to ask.\n\
         Break down tasks, assign to coder/reviewer/tester, summarize to user.\n\
         Typical: receive task → assign coder → send to reviewer → report user.\n\
         Route to: coder (build), reviewer (review), tester (test), user (report)."
    ),
    sandbox_mode: "workspace-write",
    approval_policy: "never",
};

pub const ROLE_CODER: RoleConfig = RoleConfig {
    developer_instructions: role_instructions!(
        "Your role: coder — implementation.\n\
         You have full permissions. Execute directly, no need to ask.\n\
         Write code, fix bugs, build features. Report results when done.\n\
         Route to: lead (report), reviewer (request review)."
    ),
    sandbox_mode: "workspace-write",
    approval_policy: "never",
};

pub const ROLE_REVIEWER: RoleConfig = RoleConfig {
    developer_instructions: role_instructions!(
        "Your role: reviewer — code review (read-only sandbox).\n\
         Analyze code quality, find bugs, suggest improvements.\n\
         You can read files and run commands but cannot modify files.\n\
         Route to: coder (feedback/fixes), lead (review summary/approval)."
    ),
    sandbox_mode: "read-only",
    approval_policy: "never",
};

pub const ROLE_TESTER: RoleConfig = RoleConfig {
    developer_instructions: role_instructions!(
        "Your role: tester — testing (read-only sandbox).\n\
         Run tests, verify functionality, report results.\n\
         You can run test commands but cannot modify files.\n\
         Route to: coder (bug reports), lead (test results)."
    ),
    sandbox_mode: "read-only",
    approval_policy: "never",
};

/// Look up a static role config by id.
pub fn get_role(role_id: &str) -> Option<&'static RoleConfig> {
    match role_id {
        "user" => Some(&ROLE_USER),
        "lead" => Some(&ROLE_LEAD),
        "coder" => Some(&ROLE_CODER),
        "reviewer" => Some(&ROLE_REVIEWER),
        "tester" => Some(&ROLE_TESTER),
        _ => None,
    }
}
