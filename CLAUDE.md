# AgentBridge

通用 AI Agent 桥接 GUI 桌面应用，让多个 AI 编程助手（Claude Code、Codex、未来 Gemini 等）在同一台机器上实时双向通信，支持角色分工和自动协作。

### 三种核心模式

| 模式 | 说明 |
|------|------|
| **并行思考** | 同一 prompt 同时发给多个 AI，各自独立输出，由 Lead Agent 或用户选择最优方案。验证者不看工作者上下文，防止确认偏差 |
| **顺序讨论** | AI 按预定顺序轮流发言，传递结构化结果（方案提案/审查意见/测试报告），非自由聊天。共识检测器在输出趋于一致时结束，或达到最大轮次后由 Lead 决策 |
| **角色执行** | Lead 分解任务 → Coder 并行实现 → Reviewer 独立审查 → Tester 执行测试 → 失败反馈修正循环 |

### 硬性约束

| 约束 | 说明 |
|------|------|
| 不写 `~/` | 不写 `~/.claude/`、`~/.codex/`、`~/.config/` |
| 不写用户项目文件 | 不在项目目录写入任何配置文件 |
| 用户无感 | 所有配置通过 CLI 参数 + 环境变量 + 临时目录注入 |
| CLI 优先 | 只跑命令行闭合协议环路 |
| 单体优先 | 一个 Bun Daemon + 一个 Tauri 壳 |

## 技术栈

- **桌面壳**: Tauri 2 (Rust) — 窗口管理 + Codex auth/usage/models 查询 + Claude PTY (portable-pty)
- **前端**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand + xterm.js
- **后端 daemon**: Bun + TypeScript — 角色管理 + 消息硬转发 + Codex WS 代理 + 会话管理 + 编排
- **通信协议**: MCP Tools + WebSocket + JSON-RPC 2.0 + Tauri Events/Commands

## 架构

```
┌─ Tauri Rust ──────────────────────────────┐
│ codex/auth.rs   → JWT 解码                 │
│ codex/usage.rs  → ChatGPT API 用量         │◄── invoke ──┐
│ codex/models.rs → 模型列表                  │             │
│ pty.rs          → Claude PTY 管理           │── event ──►│
│   (portable-pty: launch/write/resize/stop)  │             │
│   (--strict-mcp-config + inline JSON)       │             │
└─────────────────────────────────────────────┘             │
                                                             │
┌─ Bun Daemon ──────────────────────────────┐               │
│ daemon.ts          → 入口/角色转发          │               │
│ role-config.ts     → 角色定义/能力矩阵       │               │
│ session-manager.ts → 🆕 临时目录生命周期     │               │
│ orchestrator.ts    → 🆕 三模式编排器         │               │
│ gui-server.ts      → GUI WS 服务           │──WS 4503──►│
│ control-server.ts  → Claude MCP 桥          │             │
│ mcp-register.ts    → 🆕 MCP 注册入口        │             │
│ codex-adapter.ts   → WS 代理/拦截           │             │
│   message-handler  → turn/model 捕获        │             │
│   response-patcher → 响应兼容 patch          │             │
│ bridge.ts          → MCP server             │             │
└───────────────────────────────────────────┘               │
                                                             │
┌─ React 前端 ───────────────────────────────────────────────┘
│ bridge-store        → daemon WS 状态 (消息/agent/角色)
│ codex-account-store → Tauri invoke (profile/usage/models)
│ agent-roles.ts      → Claude --agents JSON 生成
│ AgentStatus         → 侧边栏 + 角色下拉选择
│ ClaudePanel         → Claude PTY 启停 (Tauri invoke) + 配额/角色
│ CodexAccountPanel   → 可折叠配置面板 (model/reasoning)
│ MessagePanel        → Messages | Terminal (xterm.js + Tauri event) | Logs
└────────────────────────────────────────────────────────────
```

## PTY 架构

Claude Code PTY 由 Tauri Rust 层直接管理（`portable-pty` crate），不经过 daemon。

MCP 配置通过 **内联 JSON** 传入（`--strict-mcp-config` + `--mcp-config <json>`），零文件写入。Daemon 侧通过 `buildMcpConfigJson(controlPort)` 构建 JSON 字符串，前端传给 Tauri invoke。

```
ClaudePanel.tsx                         pty.rs (Rust)
  invoke("launch_pty", {cwd, cols,     →  portable_pty::openpty()
    rows, roleId, agentsJson,           →  spawn "claude --dangerously-skip-permissions
    mcpConfigJson})                     →    --strict-mcp-config --mcp-config <inline_json>
                                        →    --agent <role> --agents <json>"
                                           │
MessagePanel.tsx (xterm.js)             ←  emit("pty-data", chunk)   ← reader thread
  term.onData(keystroke)                →  invoke("pty_write", data) → writer
  term.onResize({cols,rows})            →  invoke("pty_resize")      → master.resize()
                                           │
ClaudePanel.tsx                         ←  emit("pty-exit", code)    ← child monitor thread
  invoke("stop_pty")                    →  drop writer+pair → kills child
```

**为什么用 Rust PTY 而非 Node PTY**：Node.js `node-pty` 通过 JSON 序列化传输 PTY 数据到前端，高频输出时导致终端卡死。Rust `portable-pty` 直接通过 Tauri event 传输，性能与原生终端一致。

**内联 MCP JSON 构建**：

```typescript
function buildMcpConfigJson(controlPort: number): string {
  return JSON.stringify({
    mcpServers: {
      agentbridge: {
        command: "bun",
        args: ["run", path.resolve(__dirname, "bridge.ts")],
        env: { AGENTBRIDGE_CONTROL_PORT: String(controlPort) },
      },
    },
  });
}
```

## 角色系统

### 角色定义

角色配置分两处：
- `daemon/role-config.ts` — Codex 侧配置（developer_instructions、sandbox、approval）+ Claude agent 定义
- `src/lib/agent-roles.ts` — 前端可访问的 Claude `--agents` JSON 生成器（ClaudePanel 启动 PTY 时使用）

| 角色 | 定位 | Codex 硬限制 | Claude 硬限制 |
|------|------|-------------|-------------|
| **Lead** | 主控决策者，审核其他 Agent 输出，有最终执行权 | sandbox: workspace-write | permissionMode: bypass, 全工具 |
| **Coder** | 代码执行者，写代码交给 Lead 审核 | sandbox: workspace-write | permissionMode: bypass, 全工具 |
| **Reviewer** | 只读审核，不改文件 | sandbox: **read-only** (OS强制) | tools: Read,Grep,Glob only (**硬限制**) |
| **Tester** | 跑测试，不改文件 | sandbox: **read-only** (OS强制) | tools: Read,Grep,Glob,Bash (**硬限制**) |

### 四层防御体系

```
第一层  OS 内核沙箱 ————— sandbox_mode = "read-only" (Seatbelt/Bubblewrap)
                         模型无法绕过，文件系统级阻断

第二层  Starlark 规则 —— CODEX_HOME/rules/role.rules 白名单命令
                         最严格决策优先，shell 命令级

第三层  工具开关+协议 —— apply_patch_freeform=false + --disallowedTools + --permission-mode plan
                         内置工具禁用 + 协议级拦截

第四层  提示词引导 ————— --agents JSON (disallowedTools) + developer_instructions
                         Claude Code: 客户端级强制 (非prompt级)
                         Codex: prompt 级（被上三层兜底）
```

| 层级 | 机制 | 强制等级 | 用于 |
|------|------|---------|------|
| 第一层 | Codex `sandbox_mode: read-only` | **OS 内核强制** | Reviewer/Tester 不可写文件 |
| 第二层 | Starlark `prefix_rule` 白名单 | **进程级强制** | Reviewer/Tester 只允许安全命令 |
| 第三层 | `apply_patch_freeform=false` + Claude `--disallowedTools` + `--permission-mode plan` | **客户端强制** | 禁用文件编辑工具 |
| 第四层 | `developer_instructions` / `--agents` JSON | 软引导 | 角色行为指引 |

### Codex 注入方式

通过 `CODEX_HOME` 临时目录 + `--config` CLI 覆盖实现零侵入注入：

**认证方案（优先级）**：
1. **symlink auth.json**（推荐）— 从 `~/.codex/auth.json` 创建符号链接到临时目录，只读引用不复制
2. **环境变量** — `OPENAI_API_KEY` 直接传入
3. **OS 钥匙串** — `cli_auth_credentials_store = "keyring"`，不依赖 auth.json 文件位置

**`--config` CLI 覆盖**（不写 config.toml）：

```bash
codex app-server --listen ws://127.0.0.1:4500 \
  --config 'sandbox_mode="read-only"' \
  --config 'approval_policy="untrusted"' \
  --config 'features.apply_patch_freeform=false'
```

注意：`--config` 不支持 Starlark rules 和 AGENTS.md，这两者仍需临时 `CODEX_HOME`。

**Reviewer Starlark 规则示例**：

```python
# 写入临时 CODEX_HOME/rules/role.rules
prefix_rule(pattern = ["cat"], decision = "allow", justification = "读取文件")
prefix_rule(pattern = ["grep"], decision = "allow", justification = "搜索")
prefix_rule(pattern = ["find"], decision = "allow", justification = "查找")
prefix_rule(pattern = ["git", "log"], decision = "allow", justification = "历史")
prefix_rule(pattern = ["git", "diff"], decision = "allow", justification = "差异")
prefix_rule(pattern = ["git", "show"], decision = "allow", justification = "查看")
prefix_rule(pattern = ["ls"], decision = "allow", justification = "列目录")
prefix_rule(pattern = ["head"], decision = "allow", justification = "头部")
prefix_rule(pattern = ["tail"], decision = "allow", justification = "尾部")
prefix_rule(pattern = ["wc"], decision = "allow", justification = "统计")
```

Tester 额外允许：`pytest`、`npm test`、`npm run test`、`cargo test`、`bun test`、`vitest`、`jest`。

### 数据流（双向已验证）

```
用户发任务 → GUI 发给 Codex
  ↓
Codex 执行（受角色 sandbox/Starlark/--config 限制）
  ↓ turn 完成
Daemon 注入 Codex 输出到 Claude PTY（pty_inject → frontend → Rust PTY stdin）
  短消息(≤500字符): 全文注入 "Coder says: ..."
  长消息(>500字符): 截断摘要 + check_messages 指引
  ↓
Claude（Lead）审核
  ├── 合理 → 自己执行代码修改 → 通过 MCP reply tool 通知 Codex
  ├── 有疑问 → 通过 MCP reply tool 发回 Codex 讨论 → Codex 回复 → daemon 再注入 → 自动协商
  └── 不合理 → 通过 MCP reply tool 说明原因
```

### Claude 启动命令（由 Rust PTY 自动构建）

```bash
claude --dangerously-skip-permissions \
  --strict-mcp-config \
  --mcp-config '{"mcpServers":{"agentbridge":{"command":"bun","args":["run","<bridge_path>"]}}}' \
  --agent <roleId> \
  --agents '{"<roleId>":{"description":"...","prompt":"...","tools":"...","permissionMode":"..."}}'
```

`--strict-mcp-config` 忽略用户已有的所有 MCP 配置，只加载 agentbridge。存在已知 bug (#14490): `disabledMcpServers` 可能不被覆盖，需测试。

### 防无限循环

- Codex → Claude：daemon 硬转发（pty_inject），每次 turn 完成触发一次
- Claude → Codex：Claude 主动调用 MCP reply tool（非自动）
- Claude 不调用 reply tool = 流程结束

## 编排模式

### 并行思考

同一 prompt 同时发给 Claude + Codex（+ 未来 Gemini），各自独立输出。验证者不看工作者上下文，防止确认偏差。由 Lead Agent 或用户选择最优方案。

### 顺序讨论

AI 按预定顺序轮流发言，传递结构化结果（方案提案/审查意见/测试报告），非自由聊天。共识检测器在输出趋于一致时结束，或达到最大轮次后由 Lead 决策。

### 角色执行

Lead 分解任务 → Coder 并行实现 → Reviewer 独立审查 → Tester 执行测试 → 失败反馈修正循环。

## 会话管理

`daemon/session-manager.ts` 负责 Codex 会话的临时目录生命周期：

```
创建会话 → mkdirSync(/tmp/agentbridge-<sessionId>/codex)
         → symlinkSync(~/.codex/auth.json → 临时目录/auth.json)
         → writeFileSync(临时目录/config.toml, 角色配置)
         → writeFileSync(临时目录/rules/role.rules, Starlark 规则)
         → 设置 CODEX_HOME=临时目录 启动 Codex

清理会话 → SIGINT/SIGTERM/beforeExit 时 rm -rf 所有临时目录
         → 启动时扫描 /tmp/agentbridge-* 清理残留
```

### 用户指令合并

启动时**只读**扫描用户项目文件，合并到内存中：

```
优先级: .jason/instructions.md > CLAUDE.md > AGENTS.md > .codex/AGENTS.md
```

- Claude 侧：合并到 `--agents` JSON 的 prompt 字段（纯内存，不写文件）
- Codex 侧：合并到临时 `CODEX_HOME/AGENTS.md`（唯一需要写文件的地方，在 `/tmp`）

## MCP 注册

### 两种模式

| 场景 | 方式 | 写入位置 | 用户感知 |
|------|------|---------|---------|
| 通过 AgentBridge GUI | 自动（`--strict-mcp-config` + 内联 JSON） | **无** | 零感知 |
| 脱离 GUI 独立使用 | 手动（`agentbridge mcp register`） | 项目 `.mcp.json` | 用户主动触发 |

### 注册/注销命令

```bash
# 注册到项目（写入 .mcp.json，用户主动执行）
agentbridge mcp register

# 等价于：
claude mcp add --scope project agentbridge \
  -- bun run /path/to/agentbridge/daemon/bridge.ts

# 注销
agentbridge mcp unregister
```

**重要**：项目级 MCP 配置文件是 **`.mcp.json`**（项目根目录），不是 `.claude/mcp.json`。

## 常用命令

```bash
bun run daemon    # 启动 daemon（后端必须先启动）
bun run dev       # 启动前端开发模式（浏览器）
bun run tauri dev # 启动 Tauri 桌面应用（含前端）
bun run build     # 构建前端
bun run bridge    # MCP bridge（由 Claude Code 通过 MCP 配置自动启动）
```

## 开发规范

详细规范按路径自动加载，见 `.claude/rules/`:
- `architecture.md` — 架构、端口、消息流、模块结构
- `daemon.md` — daemon 端规范（匹配 `daemon/**/*.ts`）
- `frontend.md` — 前端规范（匹配 `src/**/*.{ts,tsx}`）
- `tauri.md` — Tauri 规范（匹配 `src-tauri/**`）

**闭环要求:**
- 遇到 bug 或设计问题，修复后必须将根因和解法写入对应 rules 文件和踩坑记录
- 每次架构变更必须同步更新本文件的架构图
- 每个文件最多 500 行
- Daemon 代码修改后必须重启 daemon，Rust 代码修改后必须重启 Tauri

## 当前状态

### v0 (MVP) 已完成

- Tauri 壳 + Rust auth/usage/models 模块
- **Rust PTY** (portable-pty) 管理 Claude Code 进程，Tauri event 直传前端 xterm.js
- **双向通信链路** — Codex→daemon→pty_inject→Claude PTY + Claude→MCP reply→daemon→Codex
- **MCP bridge 自动加载** — `--mcp-config` 确保 Claude 启动时加载 agentbridge tools
- **Bridge 自动重连** — daemon 重启后 bridge WS 自动重连
- Daemon 消息路由 (模块化: daemon-state / gui-server / control-server)
- Codex 适配器 (模块化: adapter / message-handler / response-patcher / port-utils)
- Codex 流式消息 (started/delta/completed + thinking/streaming 阶段指示)
- Codex 配置面板 (model/reasoning 下拉选择、CWD 目录选择、5h/7d 用量进度条)
- Claude MCP Tools (reply / check_messages / get_status)
- Claude 面板 (项目选择 → 角色选择 → Tauri invoke 一键启动 → PTY 终端 tab → 停止)
- 角色系统 (Lead/Coder/Reviewer/Tester + 硬限制 + 角色驱动硬转发)
- Claude `--agent --agents` 角色注入 (tools/permissionMode 硬限制)
- Codex `sandbox` + `developer_instructions` 角色注入 (OS 强制 + 软引导)
- 三标签消息面板 (Messages / Terminal / Logs)

### v1 开发中

- MCP 内联 JSON 注入 (`--strict-mcp-config` + `--mcp-config <json>`，零文件写入)
- CODEX_HOME 临时目录隔离 (symlink auth + Starlark rules + config.toml)
- 四层防御体系 (OS 沙箱 → Starlark 规则 → 工具开关 → 提示词引导)
- 会话管理器 (session-manager.ts: 临时目录创建/清理/进程退出回收)
- 三模式编排器 (orchestrator.ts: 并行思考 / 顺序讨论 / 角色执行)
- 用户指令合并 (只读扫描 CLAUDE.md/AGENTS.md → 合并到角色配置)
- MCP 注册入口 (mcp-register.ts: register/unregister CLI)
- `--config` CLI 覆盖 (sandbox_mode / approval_policy / apply_patch_freeform)

### v2 规划

- Gemini CLI 适配器 (headless JSON 模式)
- 多会话支持
- 消息搜索
- Agent 编排面板
- 设置页面
- 打包分发 (.dmg)

## 模块结构

### Tauri Rust
```
src-tauri/src/
├── main.rs                # Tauri commands 注册
├── pty.rs                 # Claude PTY (portable-pty: launch/write/resize/stop + mcp_config_json)
└── codex/
    ├── mod.rs
    ├── auth.rs            # JWT 解码 + profile
    ├── usage.rs           # ChatGPT API 用量 + SQLite 缓存
    └── models.rs          # 模型列表
```

### Daemon (Bun)
```
daemon/
├── daemon.ts              # 入口: 配置/事件绑定/角色转发
├── daemon-state.ts        # 共享状态 + 广播 helper
├── daemon-client.ts       # bridge→daemon WS 客户端
├── gui-server.ts          # GUI WS 服务 + apply_config
├── control-server.ts      # 控制 WS + Claude MCP 管理
├── role-config.ts         # 角色定义 + developer_instructions + Claude agent 配置
├── claude-pty.ts          # Claude PTY 注入逻辑
├── session-manager.ts     # 🆕 CODEX_HOME 临时目录生命周期
├── orchestrator.ts        # 🆕 三模式编排器 (并行/顺序/角色)
├── mcp-register.ts        # 🆕 MCP register/unregister CLI 入口
├── tui-connection-state.ts
├── bridge.ts              # MCP bridge server (Claude spawn)
├── index.ts               # 导出入口
├── types.ts               # 共享类型
├── control-protocol.ts
└── adapters/
    ├── base-adapter.ts           # AgentAdapter 接口定义
    ├── claude-adapter.ts         # Claude MCP 工具注册
    ├── codex-adapter.ts          # 编排: 生命周期/WS/代理
    ├── codex-message-handler.ts  # 通知解析/turn 追踪/账号捕获
    ├── codex-response-patcher.ts # 响应兼容 patch
    ├── codex-port-utils.ts       # 端口检查
    ├── codex-types.ts            # 类型定义
    └── gemini-adapter.ts         # 🆕 v2 Gemini CLI 适配器
```

### Frontend (React)
```
src/
├── lib/
│   ├── utils.ts                # cn() 工具函数
│   └── agent-roles.ts          # Claude --agents JSON 生成 (前端用)
├── stores/
│   ├── bridge-store.ts         # daemon WS 状态 (消息/agent/角色)
│   └── codex-account-store.ts  # Tauri invoke 状态 (profile/usage/models)
├── components/
│   ├── AgentStatus.tsx         # 侧边栏面板 + 角色下拉
│   ├── ClaudePanel.tsx         # Claude PTY 启停 (Tauri invoke) + 配额/角色
│   ├── CodexAccountPanel.tsx   # 可折叠配置面板 (model/reasoning)
│   ├── MessagePanel.tsx        # Messages | Terminal (xterm.js) | Logs
│   ├── MessageMarkdown.tsx     # 消息 Markdown 渲染
│   ├── ReplyInput.tsx          # 输入框
│   └── ui/                    # shadcn 组件
├── types.ts
├── main.tsx
└── App.tsx
```

## 安全

### 必须通过的安全检查点

| 检查点 | 来源 | 验收标准 |
|-------|------|---------|
| MCP 用户同意回调 | MCP 规范 Trust & Safety | 工具调用前显式批准（Reviewer/Tester 角色） |
| 第三方 MCP 提示注入防护 | Claude Code MCP 文档 | 默认不信任外部内容，审批回调中过滤 |
| 最小权限原则 | OWASP LLM Top 10 | Reviewer/Tester 的工具集最小化 |
| 沙箱不可绕过 | Codex 沙箱文档 | read-only 模式通过 OS 内核强制 |
| 凭证不泄露 | Codex 认证文档 | auth.json 通过 symlink（不复制），临时目录权限 0700 |
| 临时文件清理 | 产品要求 | 进程退出时 rm -rf 所有会话临时目录 |

### 威胁模型基线（OWASP LLM Top 10）

| 威胁 | AgentBridge 中的表现 | 控制措施 |
|------|---------------------|---------|
| Prompt Injection | 恶意代码仓库通过 AGENTS.md 注入指令 | 四层防御，OS 沙箱兜底 |
| Excessive Agency | Agent 越权执行危险操作 | sandbox read-only + Starlark 白名单 + Feature Flag |
| Insecure Output | Agent A 的输出被 Agent B 盲信执行 | Reviewer 粗验证，结构化结果传递 |
| Supply Chain | 恶意 MCP 服务器/依赖 | `--strict-mcp-config` 只加载已知 MCP |

## 踩坑记录

| 问题 | 根因 | 解法 | 规则 |
|------|------|------|------|
| 下拉菜单被面板截断 | 父容器 `overflow-hidden` | 去掉父级 `overflow-hidden` | frontend.md |
| Codex 账号信息拿不到 | `intercept` 读原始 error 对象 | patch 后重新 parse 传给 intercept | daemon.md |
| GUI 白屏 (Zustand) | selector 内 `.filter()` 新引用 | selector 取原始数组，组件内 for 循环 | frontend.md |
| GUI 白屏 (process.cwd) | 前端用了 Node.js API | 禁止前端 Node API | frontend.md |
| xterm.js 黑屏 | PTY 数据在 xterm 前到达 | 缓冲 PTY 数据，open 后回放 | frontend.md |
| Codex sandbox 参数错 | 发 `{type:"read-only"}` | 直接传字符串 `"read-only"` | — |
| `@claude` 协议不可靠 | LLM 不遵守 prompt 指令 | 改为 daemon 硬转发，不依赖 LLM | daemon.md |
| developer_instructions 不可靠 | prompt 级别，模型可能忽略 | 用硬限制 (sandbox/tools/permissions) 控制能力 | role-config.ts |
| 内嵌终端卡死 | node-pty JSON 序列化开销 | 迁移到 Rust portable-pty + Tauri event 直传 | tauri.md |
| pty_inject `[` 被吃 | `\x1b[` 构成 ANSI CSI 转义序列 | 去掉 `\x1b` 前缀和 `[` 括号 | daemon.md |
| Claude 不用 reply tool | MCP bridge 未加载 | Rust PTY 加 `--mcp-config` 参数 | pty.rs |
| Bridge 断连不重连 | daemon-client.ts 无重连逻辑 | `onclose` 触发 `tryReconnect` 自动重连 | daemon.md |
| Claude 忽略 reply 指令 | 系统 prompt 软引导不够强 | 注入消息末尾附加 reply tool 使用提醒 | daemon.ts |
| `.mcp.json` 路径错误 | 项目级 MCP 配置文件名写成 `.claude/mcp.json` | 项目级是 `.mcp.json`（项目根目录） | architecture.md |
| MCP 配置污染 | 用户已有 MCP server 被加载干扰 | `--strict-mcp-config` + 内联 JSON | pty.rs |
| CODEX_HOME auth 丢失 | 临时目录中无 auth.json | symlink 而非复制，或用 keyring 模式 | session-manager.ts |
