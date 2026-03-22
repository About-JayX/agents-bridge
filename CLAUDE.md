# AgentBridge

通用 AI Agent 桥接 GUI 桌面应用，让多个 AI 编程助手（Claude Code、Codex、未来 Gemini 等）在同一台机器上实时双向通信。

## 技术栈

- **桌面壳**: Tauri 2 (Rust) — 窗口管理 + Codex auth/usage/models 查询 + MCP 注册 + 目录选择
- **前端**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand + xterm.js
- **后端 daemon**: Bun + TypeScript — 消息路由 + Codex WS 代理 + Claude PTY 管理
- **通信协议**: MCP Tools (reply/check_messages/get_status) + WebSocket + JSON-RPC 2.0

## 架构

```
┌─ Tauri Rust ──────────────────────┐
│ codex/auth.rs   → JWT 解码         │
│ codex/usage.rs  → ChatGPT API 用量 │◄── invoke ──┐
│ codex/models.rs → 模型列表          │             │
│ dialog          → 目录选择器        │             │
│ register_mcp    → MCP 一键注册      │             │
└───────────────────────────────────┘             │
                                                   │
┌─ Bun Daemon ──────────────────────┐             │
│ daemon.ts         → 入口/事件绑定   │             │
│ gui-server.ts     → GUI WS 服务    │──WS 4503──►│
│ control-server.ts → Claude MCP 桥  │             │
│ claude-pty.ts     → PTY 管理器      │             │
│   claude-pty-helper.cjs → Node PTY │             │
│ codex-adapter.ts  → WS 代理/拦截   │             │
│   message-handler → turn/model 捕获│             │
│   response-patcher → 响应兼容 patch │             │
│ bridge.ts         → MCP server     │             │
│   claude-adapter  → MCP tools 定义  │             │
└───────────────────────────────────┘             │
                                                   │
┌─ React 前端 ─────────────────────────────────────┘
│ bridge-store        → daemon WS 状态 (消息/agent/PTY)
│ codex-account-store → Tauri invoke (profile/usage/models)
│ AgentStatus         → 侧边栏面板
│ ClaudePanel         → Claude 连接/配额/停止
│ CodexAccountPanel   → 可折叠配置面板 (model/reasoning 下拉)
│ MessagePanel        → Messages | Terminal (xterm.js) | Logs
└──────────────────────────────────────────────────
```

**数据流:**
- **Codex 消息**: codex-adapter → daemon → GUI WS → MessagePanel (流式 delta)
- **Codex→Claude 自动转发**: daemon agentMessage → sendToClaudePty() → Claude PTY stdin
- **Claude 终端**: claude-pty-helper.cjs (Node + node-pty) → daemon → WS → xterm.js
- **Claude MCP**: bridge.ts (3 tools: reply/check_messages/get_status) ← Claude CLI
- **账号/用量**: Tauri Rust invoke → codex-account-store
- **配置切换**: GUI → daemon apply_config → Codex reconnect with new params

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
- 每次架构变更（新增模块、数据流调整、职责迁移）必须同步更新本文件的架构图
- 每个文件最多 500 行
- Daemon 代码修改后必须重启 daemon，Rust 代码修改后必须重启 Tauri

## MCP 注册

GUI 内一键注册，或手动添加到 `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "agentbridge": {
      "command": "bun",
      "args": ["run", "/Users/jason/floder/agent-bridge/daemon/bridge.ts"]
    }
  }
}
```

## 当前状态 (MVP)

已实现:
- Tauri 壳 + Rust auth/usage/models/MCP注册 模块
- Daemon 消息路由 (模块化: daemon-state / gui-server / control-server)
- Codex 适配器 (模块化: adapter / message-handler / response-patcher / port-utils)
- Codex 流式消息 (started/delta/completed + thinking/streaming 阶段指示)
- Codex 配置面板 (model/reasoning 下拉选择、CWD 目录选择、5h/7d 用量进度条)
- Claude MCP 纯 Tools 方案 (reply / check_messages / get_status，无 channel)
- Claude PTY 真实终端 (node-pty via Node helper + xterm.js 渲染)
- Claude 面板 (项目选择 → 一键启动 → PTY 终端 tab → 停止)
- 三标签消息面板 (Messages / Terminal / Logs)

待实现: Gemini CLI 适配器、多会话支持、消息搜索、Agent 编排、设置页面、打包分发(.dmg)

## 踩坑记录

| 问题 | 根因 | 解法 | 规则 |
|------|------|------|------|
| 下拉菜单被面板截断 | 父容器 `overflow-hidden` 裁剪了 z-50 弹出层 | 去掉父级 `overflow-hidden` | frontend.md 层级与布局 |
| Codex 账号信息拿不到 | `patchResponse` 返回新 JSON 但 `intercept` 仍在读原始 error 对象 | patch 后重新 parse 传给 intercept | daemon.md |
| `initSession` 丢失 model | `thread/start` 响应没走 `handler.intercept` | 在 resolve 前调用 `handler.intercept(msg)` | — |
| GUI 白屏 (Zustand 无限循环) | selector 内 `.filter()` 每次返回新引用 | selector 取原始数组，组件内 for 循环过滤 | frontend.md 性能优化 |
| GUI 白屏 (process.cwd) | 前端用了 Node.js API | 禁止前端使用 Node API，通过 invoke 获取 | frontend.md 性能优化 |
| Claude --print 不加载 MCP | `--print` 模式不读 mcp.json | 用 `--mcp-config` 传入内联 JSON | — |
| Claude --print 自动退出 | 单次执行模式 | 加 `--input-format stream-json` 保持 stdin | — |
| stream-json 输入格式错误 | 格式不是 `user_message` | 正确格式: `{type:"user",message:{role:"user",content}}` | — |
| node-pty 在 Bun 中 spawn 失败 | Bun 不兼容 node-pty native addon | 用 Node.js 子进程运行 PTY helper (claude-pty-helper.cjs) | daemon.md |
| node-pty 在 Node v24 中崩溃 | 预编译 binary 不兼容 | `npx node-gyp rebuild --directory=node_modules/node-pty` | — |
| xterm.js 终端黑屏 | PTY 数据在 xterm 初始化前到达被丢弃 | 缓冲 PTY 数据，xterm open 后回放 | frontend.md |
