# 架构概览

```
Claude Code <--MCP--> bridge.ts <--WS--> daemon.ts <--WS Proxy--> Codex app-server
                                             |
                                        GUI WS (4503)
                                             |
                                      Tauri/React 前端
                                             |
                                      Tauri Rust 后端 ──► ChatGPT API (用量)
                                             |           ► ~/.codex/auth.json (JWT)
                                             |           ► ~/.codex/models_cache.json
```

## 端口分配

| 端口 | 用途 | 服务 |
|------|------|------|
| 4500 | Codex app-server WebSocket | codex-adapter.ts |
| 4501 | Codex proxy (TUI 连接) | codex-adapter.ts |
| 4502 | daemon 控制端口 (bridge <-> daemon) | daemon.ts |
| 4503 | GUI WebSocket (daemon -> 前端) | daemon.ts |
| 1420 | Vite dev server | vite |

## 数据流

### 消息路由 (Bun Daemon WS)
- **Codex -> Claude**: codex-adapter 拦截 agentMessage -> daemon 转发 -> bridge -> MCP notification -> Claude
- **Claude -> Codex**: Claude 调用 reply 工具 -> bridge -> daemon -> codex.injectMessage
- **GUI 实时同步**: daemon 所有消息事件同时广播到 4503 GUI WebSocket
- **协议数据**: model / reasoningEffort / cwd 等从 thread/start 响应和 turn 通知中拦截

### 账号/用量 (Tauri Rust invoke)
- **Profile**: 前端 invoke `get_codex_account` → Rust 读 `~/.codex/auth.json` 解码 JWT → 返回 email/name/plan
- **Usage**: 前端 invoke `refresh_usage` → Rust 调 `chatgpt.com/backend-api/wham/usage` (fallback SQLite 缓存)
- **Models**: 前端 invoke `list_codex_models` → Rust 读 `~/.codex/models_cache.json`
- **目录**: 前端 invoke `pick_directory` → Rust 调 Tauri dialog

### 配置热切换 (GUI -> Daemon -> Codex)
- 前端发 `apply_config { model, reasoningEffort, cwd }` → daemon gui-server
- daemon 断开当前 session → `initSession(opts)` 传入新参数 → `thread/start` params 带 model/reasoning/cwd
- Codex app-server 用新配置创建 thread → 响应回传给前端

## 模块结构

### Daemon (Bun)
```
daemon/
├── daemon.ts              # 入口: 配置/事件绑定/启动关闭
├── daemon-state.ts        # 共享状态 + 广播 helper
├── gui-server.ts          # GUI WS 服务 + apply_config
├── control-server.ts      # 控制 WS + Claude 管理
├── tui-connection-state.ts
├── bridge.ts              # MCP bridge (Claude spawn)
├── types.ts               # 共享类型
├── control-protocol.ts
└── adapters/
    ├── codex-adapter.ts          # 编排: 生命周期/WS/代理
    ├── codex-message-handler.ts  # 通知解析/turn 追踪/账号捕获
    ├── codex-response-patcher.ts # 响应兼容 patch
    ├── codex-port-utils.ts       # 端口检查
    └── codex-types.ts            # 类型定义
```

### Tauri Rust
```
src-tauri/src/
├── main.rs                # Tauri commands
└── codex/
    ├── mod.rs
    ├── auth.rs            # JWT 解码 + profile
    ├── usage.rs           # ChatGPT API 用量 + SQLite 缓存
    └── models.rs          # 模型列表
```

### Frontend (React)
```
src/
├── stores/
│   ├── bridge-store.ts         # daemon WS 状态
│   └── codex-account-store.ts  # Tauri invoke 状态
├── components/
│   ├── AgentStatus.tsx         # 侧边栏面板
│   ├── CodexAccountPanel.tsx   # 可折叠配置面板
│   ├── MessagePanel.tsx        # 消息列表
│   ├── ReplyInput.tsx          # 输入框
│   └── ui/                    # shadcn 组件
├── types.ts
└── lib/utils.ts
```
