# Claude 链路修复记录

> **强制规则:** 每次修复或发现 Claude 链路问题，必须在此文档记录。
> 包括：问题描述、根因、修复方案、运行时验证结果。
> 错误的修复尝试也必须记录。

## 官方文档参考

- Channel API 完整文档: `docs/agents/claude-channel-api.md`
- 在线: https://docs.anthropic.com/en/docs/claude-code

## Channel 启动参数

### CLI 启动方式

```bash
claude --dangerously-load-development-channels server:<mcp_server_name>
```

- `server:agentbridge` — 加载 `.mcp.json` 中名为 `agentbridge` 的 MCP server 作为 channel
- `plugin:<name>@<marketplace>` — 加载插件形式的 channel
- 此 flag 绕过 allowlist，仅限开发测试使用
- 需要 Claude Code >= 2.1.80
- 需要 claude.ai 登录（不支持 Console/API key）

### Server 构造函数参数

MCP `Server` 构造函数接受 `(serverInfo, options)`：

| 参数 | 类型 | 必填 | 作用 |
|------|------|------|------|
| `serverInfo.name` | `string` | 是 | Server 名称，对应 `.mcp.json` 的 key 和 `<channel source="...">` 的 `source` 属性 |
| `serverInfo.version` | `string` | 是 | Server 版本号 |
| `options.capabilities.experimental['claude/channel']` | `{}` | **是** | 声明这是一个 channel。必须为空对象 `{}`。缺少此项则不是 channel |
| `options.capabilities.experimental['claude/channel/permission']` | `{}` | 否 | 声明可以接收 permission relay 请求（远程审批）。需 >= 2.1.81 |
| `options.capabilities.tools` | `{}` | 否 | 声明提供 tools（双向 channel 需要）。空对象 `{}` 即可，具体 tool 通过 handler 注册 |
| `options.instructions` | `string` | 推荐 | 注入到 Claude system prompt。告诉 Claude 事件格式、是否需要回复、用哪个 tool 回复 |

### Channel Notification 参数

发送事件: `mcp.notification({ method, params })`

| 参数 | 类型 | 必填 | 作用 |
|------|------|------|------|
| `method` | `"notifications/claude/channel"` | 是 | 固定值，channel 事件通知 |
| `params.content` | `string` | 是 | 事件正文，成为 `<channel>` 标签的 body |
| `params.meta` | `Record<string, string>` | 否 | 每个 key 成为 `<channel>` 标签属性。key 只允许字母/数字/下划线，含连字符的 key 会被静默丢弃 |

发送到 Claude 后的格式:
```xml
<channel source="agentbridge" chat_id="123" from="user">
消息内容
</channel>
```

### Reply Tool 参数

tool 通过 `ListToolsRequestSchema` handler 注册:

| 参数 | 类型 | 必填 | 作用 |
|------|------|------|------|
| `name` | `string` | 是 | Tool 名称，如 `"reply"` |
| `description` | `string` | 是 | Tool 描述，Claude 用来决定何时调用 |
| `inputSchema` | JSON Schema | 是 | 输入参数 schema。当前 bridge 用 `chat_id` + `text` |

tool 调用通过 `CallToolRequestSchema` handler 处理，返回格式:
```json
{ "content": [{ "type": "text", "text": "sent" }] }
```

### Permission Relay 参数

#### Permission Request（Claude Code → Channel）

通知方法: `notifications/claude/channel/permission_request`

| 字段 | 类型 | 作用 |
|------|------|------|
| `request_id` | `string` | 5 个小写字母（a-z 不含 l），唯一请求标识 |
| `tool_name` | `string` | 要执行的工具名，如 `"Bash"`、`"Write"` |
| `description` | `string` | 人类可读的操作描述 |
| `input_preview` | `string` | 工具参数 JSON 预览，截断到约 200 字符 |

#### Permission Verdict（Channel → Claude Code）

通知方法: `notifications/claude/channel/permission`

| 字段 | 类型 | 值 | 作用 |
|------|------|---|------|
| `request_id` | `string` | 必须回传原 request 的 ID | 匹配挂起的请求 |
| `behavior` | `string` | `"allow"` 或 `"deny"` | 允许或拒绝工具调用 |

### .mcp.json 注册格式

```json
{
  "mcpServers": {
    "agentbridge": {
      "command": "/absolute/path/to/agent-bridge-bridge",
      "args": []
    }
  }
}
```

- `command` 当前有意使用绝对路径（Tauri 打包要求）
- Claude Code 在启动时读取并 spawn 每个 server 为子进程
- stdio 通信（newline-delimited JSON-RPC 2.0，省略 `"jsonrpc":"2.0"` header）

## 当前实现与 API 的对照

| API 功能 | bridge 实现 | 状态 |
|----------|-------------|------|
| `claude/channel` capability | `mcp_protocol.rs` initialize result | ✅ 已实现 |
| `claude/channel/permission` capability | `mcp_protocol.rs` initialize result | ✅ 已实现 |
| `instructions` | `mcp_protocol.rs` initialize result | ✅ 已实现 |
| `tools` capability + `reply` tool | `tools.rs` + `mcp.rs` ListTools handler | ✅ 已实现 |
| `notifications/claude/channel` | `channel_state.rs` prepare_channel_message | ✅ 已实现 |
| `notifications/claude/channel/permission_request` | `mcp.rs` parse + bridge outbound | ✅ 已实现 |
| `notifications/claude/channel/permission` | `channel_state.rs` permission_notification | ✅ 已实现 |
| meta 属性 (`from`, `chat_id`) | `channel_state.rs` prepare_channel_message | ✅ 已实现 |
| Sender gating | `channel_state.rs` ALLOWED_SENDERS | ✅ 已实现 |
| Pre-init message buffering | `mcp.rs` pre_init_buffer | ✅ 已实现 |

## 修复记录

### 2026-03-25: 初始审计

- [已修复] bridge pre-init 消息丢失 — 添加本地缓冲 + 回放
- [已修复] stdout 写失败静默丢消息 — 写失败时 break MCP 循环
- [已修复] push_tx 死通道检测 — send 失败时退出
- [已修复] 重连反压级联 — 退避期间 drain reply_rx
- [已修复] shell 注入风险 — 非 macOS 用 Command::new

### 2026-03-25: 深度审查

- [已修复] pre-init buffer replay break 不传播到外层循环
- [已修复] Claude 启动改为静默后台进程（dev 模式弹终端，release 静默）

## 当前已知限制

- Channel preview 是实验性功能，需要 `--dangerously-load-development-channels`
- 依赖 Claude Code >= 2.1.80 / permission relay >= 2.1.81
- 当前只有 `reply` 一个 tool
- 不支持 `--agent --agents` 角色注入
- meta key 不能包含连字符（会被 Claude Code 静默丢弃）
- `chat_targets` eviction 是随机的（HashMap 无序），长会话可能影响活跃对话
- bridge 重连时不重发 pending permission requests
