# Per-Agent Role Assignment

## Summary

将统一 `role` 字段拆分为 `claudeRole` + `codexRole`，支持异构角色分配（如 Claude=Lead, Codex=Coder）。角色定义（`ROLES` 常量）保持统一共享。同时修复 review 中发现的 critical/important 问题。

## Motivation

当前统一 `role` 强制 Claude 和 Codex 使用相同角色，无法支持 CLAUDE.md 中定义的角色执行模式（Lead 分任务 → Coder 实现 → Reviewer 审查 → Tester 测试）。按「参数不同就分离，相同就统一」原则：角色选择是 agent 特定的（可不同），角色定义是共享的（相同）。

## Design

### Data Model

**daemon-state.ts:**
```typescript
// Before
role: RoleId = "lead";

// After
claudeRole: RoleId = "lead";
codexRole: RoleId = "coder";
```

**bridge-store types.ts:**
```typescript
// Before
role: string;
setRole: (role: string) => void;

// After
claudeRole: string;
codexRole: string;
setRole: (agent: "claude" | "codex", role: string) => void;
```

### Protocol

**GUI → Daemon (set_role):**
```json
{ "type": "set_role", "agent": "claude", "role": "lead" }
{ "type": "set_role", "agent": "codex", "role": "coder" }
```

**Daemon → GUI (role_sync):**
```json
{
  "type": "role_sync",
  "payload": { "claudeRole": "lead", "codexRole": "coder" }
}
```

### Daemon Logic

**role-actions.ts — `handleSetRole`:**
- 接收 `{ agent, role }` 参数
- 根据 `agent` 更新 `state.claudeRole` 或 `state.codexRole`
- 如果改的是 codexRole 且 Codex 有活跃 session → 重连 Codex（用新角色的 sandbox/instructions）
- 如果改的是 claudeRole → 只广播（Claude PTY 需要重启才能生效，不自动重启）
- 广播 `role_sync` 事件（包含两个角色）

**codex-events.ts — 转发逻辑:**
```typescript
// Before
const codexRole = ROLES[state.role];

// After
const codexRole = ROLES[state.codexRole];
```

使用 `codexRole.forwardPrompt` 和 `codexRole.label` 构建注入文本。

### Frontend

**AgentStatus/index.tsx:**
- 移除顶部 `RoleSelect`

**ClaudePanel/index.tsx:**
- 新增 `RoleSelect`，绑定 `claudeRole`
- 启动 PTY 时用 `claudeRole`（已有逻辑，改引用即可）
- 锁定状态（connected/running）时 disabled

**CodexPanel.tsx:**
- 新增 `RoleSelect`，绑定 `codexRole`
- Codex 运行时 disabled（改角色需要重连）

**RoleSelect.tsx:**
```typescript
// Before
export function RoleSelect({ disabled }: { disabled?: boolean })

// After
export function RoleSelect({ agent, disabled }: {
  agent: "claude" | "codex";
  disabled?: boolean;
})
```
从 store 读取对应 agent 的角色，调用 `setRole(agent, role)`。

**message-handler.ts:**
```typescript
case "role_sync": {
  const { claudeRole, codexRole } = guiEvent.payload;
  set({ claudeRole, codexRole });
  break;
}
```

### Bugfixes (bundled)

1. **stop_pty 死锁** — `child.wait()` 在持锁时阻塞。改为先 `take()` child，释放锁，再 `wait()`。
2. **空 forwardPrompt** — `user` 角色 `forwardPrompt` 为空。添加 fallback：`forwardPrompt || "${role.label} says:"`。
3. **死代码** — 删除未使用的 `ClaudeRoleSelect.tsx`。
4. **CLI 参数校验** — `launch_pty` 中验证 model/effort 白名单。

## Files Changed

| File | Change |
|------|--------|
| `daemon/daemon-state.ts` | `role` → `claudeRole` + `codexRole` |
| `daemon/gui-server/role-actions.ts` | `handleSetRole` 接收 `{ agent, role }` |
| `daemon/gui-server/handlers.ts` | 无变化（已转发到 role-actions） |
| `daemon/codex-events.ts` | `state.role` → `state.codexRole` |
| `src/stores/bridge-store/types.ts` | `role` → `claudeRole` + `codexRole` |
| `src/stores/bridge-store/index.ts` | `setRole(agent, role)` |
| `src/stores/bridge-store/message-handler.ts` | `role_sync` 解构两个角色 |
| `src/components/AgentStatus/RoleSelect.tsx` | 加 `agent` prop |
| `src/components/AgentStatus/index.tsx` | 移除顶部 RoleSelect |
| `src/components/ClaudePanel/index.tsx` | 加 RoleSelect + 用 claudeRole |
| `src/components/AgentStatus/CodexPanel.tsx` | 加 RoleSelect |
| `src/components/ClaudePanel/ClaudeRoleSelect.tsx` | 删除（死代码） |
| `daemon/role-config/roles.ts` | user 角色加 forwardPrompt fallback |
| `src-tauri/src/pty.rs` | 修复 stop_pty 死锁 + model/effort 校验 |

## Not Changed

- `ROLES` 定义结构不变（角色定义是共享的）
- `RoleId` 类型不变
- `ROLE_OPTIONS` 不变
- `agent-roles.ts` 不变（前端 Claude 专用的 agents JSON 生成器）
- 编排器 / session-manager 不变（v1 scope）
