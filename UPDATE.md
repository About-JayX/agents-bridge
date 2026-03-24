# AgentBridge v1 架构更新记录

> 更新日期: 2026-03-24
> 基于: agentbridge-v1-dev-spec.md (v1.0-final)

---

## 变更概览

| # | 变更项 | 原方案 (v0 MVP) | 新方案 (v1) |
|---|--------|----------------|-------------|
| 1 | MCP 注入 | 文件 `--mcp-config ~/.claude/mcp.json` | 内联 JSON `--strict-mcp-config --mcp-config <json>` |
| 2 | PTY 启动 | `launch_pty(cwd, cols, rows, roleId, agentsJson)` | 新增 `mcpConfigJson` 参数 |
| 3 | 角色强制 | 扁平强制表（sandbox + tools 两层） | 四层防御体系（OS → Starlark → 工具开关 → 提示词） |
| 4 | Codex 隔离 | 无隔离，继承系统 `~/.codex` | `CODEX_HOME` 临时目录 + symlink auth.json |
| 5 | 新模块 | — | session-manager / orchestrator / mcp-register |
| 6 | 编排模式 | 仅角色执行 | 并行思考 / 顺序讨论 / 角色执行 三种模式 |
| 7 | 安全基线 | 无 | OWASP LLM Top 10 威胁模型 + 安全检查点 |
| 8 | MCP 路径 | `.claude/mcp.json` | 项目级修正为 `.mcp.json`（项目根目录） |
| 9 | 产品定位 | 无明确定义 | 三种核心模式 + 五项硬性约束 |
| 10 | 用户指令 | 不处理 | 只读扫描合并 CLAUDE.md/AGENTS.md 到角色配置 |

---

## 详细变更

### 1. MCP 注入: 文件 → 内联 JSON

**原方案**：
```rust
// pty.rs — 读取文件路径
let mcp_config = home.join(".claude").join("mcp.json");
cmd.arg("--mcp-config");
cmd.arg(mcp_config.to_string_lossy().as_ref());
```

**新方案**：
```rust
// pty.rs — 接收内联 JSON 字符串
if !mcp_config_json.is_empty() {
    cmd.arg("--strict-mcp-config");  // 忽略所有已有 MCP 配置
    cmd.arg("--mcp-config");
    cmd.arg(&mcp_config_json);       // 直接传 JSON 字符串
}
```

**改进**：
- 零文件写入（不写 `~/.claude/mcp.json`）
- `--strict-mcp-config` 隔离用户已有 MCP server
- Daemon 侧 `buildMcpConfigJson(controlPort)` 动态构建

**已知风险**：`--strict-mcp-config` 存在 bug #14490（`disabledMcpServers` 可能不被覆盖），需 P0 验证。

### 2. PTY 启动参数变更

**影响文件**：
- `src-tauri/src/pty.rs` — `launch_pty` 函数签名新增 `mcp_config_json: String`
- `src/components/ClaudePanel.tsx` — invoke 调用新增 `mcpConfigJson` 参数
- `daemon/role-config.ts` — 新增 `buildMcpConfigJson()` 函数

### 3. 四层防御体系

替换原有扁平强制表，建立分层防御：

| 层级 | 机制 | 强制等级 | 无法绕过 |
|------|------|---------|---------|
| L1 | OS 沙箱 (Seatbelt/Bubblewrap) | 内核级 | 是 |
| L2 | Starlark `prefix_rule` 白名单 | 进程级 | 是 |
| L3 | `--disallowedTools` + `apply_patch_freeform=false` | 客户端级 | 否（但被 L1/L2 兜底） |
| L4 | `developer_instructions` + `--agents` JSON | 提示词级 | 否（被上三层兜底） |

**新增 Starlark 规则**：Reviewer/Tester 角色写入临时 `CODEX_HOME/rules/role.rules`，白名单安全命令。

### 4. Codex 隔离

**新增 `CODEX_HOME` 临时目录方案**：

```
/tmp/agentbridge-<sessionId>/codex/
├── auth.json          → symlink → ~/.codex/auth.json
├── config.toml        ← 角色配置写入
└── rules/
    └── role.rules     ← Starlark 规则写入
```

**三种认证方案（按优先级）**：
1. symlink auth.json（推荐）
2. `OPENAI_API_KEY` 环境变量
3. `cli_auth_credentials_store = "keyring"` OS 钥匙串

**`--config` CLI 替代方案**：大部分配置可通过 `--config` 参数覆盖，不写 config.toml。但 Starlark rules 和 AGENTS.md 仍需临时目录。

### 5. 新增模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 会话管理 | `daemon/session-manager.ts` | 临时 CODEX_HOME 创建/symlink/清理、进程退出回收 |
| 编排器 | `daemon/orchestrator.ts` | 三模式状态机（并行思考/顺序讨论/角色执行） |
| MCP 注册 | `daemon/mcp-register.ts` | `agentbridge mcp register/unregister` CLI 入口 |
| Gemini 适配器 | `daemon/adapters/gemini-adapter.ts` | v2 Gemini CLI headless JSON 适配（占位） |

### 6. 三种编排模式

| 模式 | 触发 | 数据流 | 终止条件 |
|------|------|--------|---------|
| 并行思考 | 用户选择 | prompt → 多 AI 并行 → Lead 选优 | Lead 选择或用户决定 |
| 顺序讨论 | 用户选择 | AI 按序轮流 → 结构化结果传递 | 共识检测 或 最大轮次 |
| 角色执行 | 默认 | Lead 分解 → Coder → Reviewer → Tester | 测试通过 或 Lead 决策 |

### 7. 安全基线

新增两个表：
- **安全检查点**（6 项）：MCP 同意回调、提示注入防护、最小权限、沙箱不可绕过、凭证不泄露、临时文件清理
- **威胁模型**（4 项）：Prompt Injection、Excessive Agency、Insecure Output、Supply Chain

### 8. MCP 路径修正

| 配置 | 错误理解 | 正确理解 |
|------|---------|---------|
| 项目级 MCP | `.claude/mcp.json` | **`.mcp.json`**（项目根目录） |
| 用户全局 MCP | `~/.claude/mcp.json` | `~/.claude/mcp.json`（不变） |
| v1 GUI 模式 | 写入配置文件 | 内联 JSON（不写任何文件） |

### 9. 产品定位

新增明确的产品定义：
- **三种核心模式**：并行思考、顺序讨论、角色执行
- **五项硬性约束**：不写 `~/`、不写项目文件、用户无感、CLI 优先、单体优先

### 10. 用户指令合并

新增只读扫描机制：
- 启动时读取 `.jason/instructions.md` > `CLAUDE.md` > `AGENTS.md` > `.codex/AGENTS.md`
- Claude 侧：合并到 `--agents` JSON prompt 字段（纯内存）
- Codex 侧：合并到临时 `CODEX_HOME/AGENTS.md`（`/tmp` 中）

---

## CLAUDE.md 结构变更

| 章节 | 操作 | 说明 |
|------|------|------|
| 标题+描述 | 扩展 | 新增「三种核心模式」和「硬性约束」表 |
| 技术栈 | 保持 | 无变更 |
| 架构图 | 更新 | 新增 session-manager / orchestrator / mcp-register，PTY 标注 strict-mcp |
| PTY 架构 | 更新 | launch_pty 签名变更，内联 MCP JSON 说明，buildMcpConfigJson 示例 |
| 角色系统 | 重写 | 四层防御体系、Codex 注入方式、Starlark 规则、--config 覆盖 |
| 编排模式 | **新增** | 三种模式详细说明 |
| 会话管理 | **新增** | session-manager 生命周期、用户指令合并 |
| MCP 注册 | **新增** | 两种模式、register/unregister 命令、.mcp.json 修正 |
| 常用命令 | 保持 | 无变更 |
| 开发规范 | 保持 | 无变更 |
| 当前状态 | 重构 | 拆分为 v0 已完成 / v1 开发中 / v2 规划 |
| 模块结构 | 更新 | 新增文件、补全遗漏文件（daemon-client/claude-pty/index 等） |
| 安全 | **新增** | 安全检查点 + OWASP LLM Top 10 威胁模型 |
| 踩坑记录 | 追加 | +3 条新记录（MCP 路径、配置污染、auth 丢失） |

---

## 待实施 P0 验证清单

在编写实现代码之前，必须先跑以下实验确认核心假设：

```bash
# 实验 1：Claude Code 内联 MCP 配置（预期：MCP server 加载成功）
claude --dangerously-skip-permissions \
  --strict-mcp-config \
  --mcp-config '{"mcpServers":{"test":{"command":"echo","args":["hello"]}}}' \
  -p "list your MCP tools"

# 实验 2：Codex CODEX_HOME 重定向 + symlink auth（预期：认证成功）
mkdir -p /tmp/test-codex-home
ln -s ~/.codex/auth.json /tmp/test-codex-home/auth.json
CODEX_HOME=/tmp/test-codex-home codex app-server --listen ws://127.0.0.1:4599

# 实验 3：Codex --config 覆盖 sandbox（预期：read-only 生效）
CODEX_HOME=/tmp/test-codex-home codex \
  --config 'sandbox_mode="read-only"' \
  --config 'features.apply_patch_freeform=false' \
  -p "try to create a file called /tmp/test.txt"

# 实验 4：Starlark 规则拦截（预期：rm 被 forbidden）
codex execpolicy check --rules /tmp/test-rules/reviewer.rules rm -rf /
```

---

## 实施路线图

| 阶段 | 目标 | 关键文件 |
|------|------|---------|
| **P0 验证** | 四个实验全部通过 | — |
| **P0 协议闭环** | pty.rs 改造 + CODEX_HOME + 端到端双向消息 | pty.rs, codex-adapter.ts, session-manager.ts, ClaudePanel.tsx |
| **P1 角色强制** | 四层防御全部上线 | role-config.ts, session-manager.ts |
| **P1.5 MCP 入口** | register/unregister CLI | mcp-register.ts |
| **P2 指令合并** | 只读扫描 + 合并 | role-config.ts, session-manager.ts |
| **P3 编排** | 三模式编排器 | orchestrator.ts |
| **P4 发布** | 终端稳定 + 打包 | .dmg |
