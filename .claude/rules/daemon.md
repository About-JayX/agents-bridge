---
paths:
  - "daemon/**/*.ts"
---

# Daemon 开发规范

- 运行时为 Bun，类型用 `bun-types`（tsconfig.daemon.json）
- 所有适配器实现 `adapters/base-adapter.ts` 中的 `AgentAdapter` 接口
- 新增 Agent 适配器放 `daemon/adapters/`
- 日志统一写 `/tmp/agentbridge.log`，格式 `[ISO timestamp] [ModuleName] message`
- GUI 事件通过 `broadcastToGui()` 推送，事件类型: `agent_message` | `agent_status` | `system_log` | `daemon_status`
- 每条消息带 `source` 字段 ("claude" | "codex")，不回传给来源方（防循环）

## 文件规模
- **每个文件最多 500 行**，超过必须拆分
- daemon 模块结构: `daemon.ts`(入口) / `daemon-state.ts`(共享状态) / `gui-server.ts` / `control-server.ts`
- adapter 模块结构: `codex-adapter.ts`(编排) / `codex-message-handler.ts` / `codex-response-patcher.ts` / `codex-port-utils.ts` / `codex-types.ts`

## 封装与抽离
- 每个 Agent 适配器独立封装，通过 EventEmitter 暴露事件，daemon.ts 不直接访问内部状态
- 公共类型定义放 `daemon/types.ts`、`daemon/control-protocol.ts`、`daemon/adapters/codex-types.ts`
- 工具函数和可复用逻辑抽为独立模块
- 服务器模块通过依赖注入（deps 参数）获取共享依赖，不直接 import daemon.ts 中的变量

## 性能优化
- 避免高频广播：同类型状态变更做节流（如 rateLimits 更新）
- WebSocket 消息序列化只做一次，多个 client 共享同一 JSON 字符串
- Map/Set 及时清理过期条目，防止内存泄漏

## 代码检查
- 每次修改后必须执行 `npx tsc --noEmit -p tsconfig.daemon.json` 确保零类型错误
- 不允许未处理的 Promise rejection，异步操作必须有 catch 或 try/catch
