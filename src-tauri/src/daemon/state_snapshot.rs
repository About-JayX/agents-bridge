use super::*;

impl DaemonState {
    pub fn status_snapshot(&self) -> DaemonStatusSnapshot {
        let mut agents = vec![
            AgentRuntimeStatus {
                agent: "claude".into(),
                online: self.is_agent_online("claude"),
            },
            AgentRuntimeStatus {
                agent: "codex".into(),
                online: self.is_agent_online("codex"),
            },
        ];

        let mut other_agents: Vec<_> = self
            .attached_agents
            .keys()
            .filter(|agent| agent.as_str() != "claude" && agent.as_str() != "codex")
            .cloned()
            .collect();
        other_agents.sort();
        agents.extend(other_agents.into_iter().map(|agent| AgentRuntimeStatus {
            agent,
            online: true,
        }));

        DaemonStatusSnapshot {
            agents,
            claude_role: self.claude_role.clone(),
            codex_role: self.codex_role.clone(),
        }
    }

    /// Returns a stable-ordered snapshot of currently online agents.
    /// Order: claude first, codex second, then any other bridge agents by agent_id.
    pub fn online_agents_snapshot(&self) -> Vec<OnlineAgentInfo> {
        let mut result = Vec::new();
        if self.is_agent_online("claude") {
            result.push(OnlineAgentInfo {
                agent_id: "claude".into(),
                role: self.claude_role.clone(),
                model_source: "claude".into(),
            });
        }
        if self.is_agent_online("codex") {
            result.push(OnlineAgentInfo {
                agent_id: "codex".into(),
                role: self.codex_role.clone(),
                model_source: "codex".into(),
            });
        }
        let mut others: Vec<_> = self
            .attached_agents
            .keys()
            .filter(|k| k.as_str() != "claude" && k.as_str() != "codex")
            .cloned()
            .collect();
        others.sort();
        for agent_id in others {
            result.push(OnlineAgentInfo {
                agent_id: agent_id.clone(),
                role: "unknown".into(),
                model_source: "claude".into(),
            });
        }
        result
    }
}
