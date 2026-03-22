---
paths:
  - "src-tauri/**"
---

# Tauri 开发规范

- Tauri 2，Rust 端负责: Codex auth/usage/models 查询 + 系统对话框
- daemon 作为独立 Bun 进程运行，不嵌入 Tauri sidecar
- 前端通过 `invoke` 调用 Rust 命令获取静态/低频数据，运行时数据走 daemon WS

## 模块职责
- `codex/auth.rs` — 读 `~/.codex/auth.json`，解码 JWT，提取 profile
- `codex/usage.rs` — 调 ChatGPT API 获取用量，fallback 查 Codex SQLite 日志
- `codex/models.rs` — 读 `~/.codex/models_cache.json`，返回可用模型列表

## Tauri Commands
- `get_codex_account` → `CodexProfile`
- `refresh_usage` → `UsageSnapshot`
- `list_codex_models` → `Vec<CodexModel>`
- `pick_directory` → `Option<String>`

## 注意事项
- 新增 command 必须在 `main.rs` 的 `invoke_handler` 中注册
- 需要系统权限的插件必须在 `capabilities/default.json` 中声明
- serde 序列化统一用 `#[serde(rename_all = "camelCase")]` 与前端对齐
