# Claude SDK Full Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Claude migration so all user-facing Claude runtime paths use `--sdk-url` instead of the legacy PTY/channel stack.

**Architecture:** Keep the verified SDK transport (`claude --print --sdk-url ... --input-format stream-json --output-format stream-json`) as the only supported Claude runtime path. Remove user-facing PTY/channel launch and terminal control surfaces, and route new/resume/history attach through the SDK launcher so the daemon, task graph, and UI all agree on a single Claude session model.

**Tech Stack:** Tauri 2, Rust/Tokio daemon, React/TypeScript frontend, Bun tests, Cargo tests

---

### Task 1: Lock the frontend to SDK semantics

**Files:**
- Modify: `src/components/AgentStatus/index.tsx`
- Modify: `src/components/ClaudePanel/index.tsx`
- Modify: `src/components/ClaudePanel/ClaudeHint.tsx`
- Modify: `src/components/MessagePanel/index.tsx`
- Modify: `src/components/MessagePanel/view-model.ts`
- Modify: `src/stores/bridge-store/types.ts`
- Modify: `src/stores/bridge-store/index.ts`
- Modify: `src/stores/bridge-store/listener-setup.ts`
- Test: `tests/message-panel-view-model.test.ts`
- Test: `src/components/ClaudePanel/launch-request.test.ts`

- [ ] **Step 1: Write failing frontend tests for non-channel wording and non-terminal Claude UI**

Add assertions that the Claude panel no longer describes startup as channel preview mode and that message panel view-model no longer exposes PTY terminal placeholder semantics as the primary Claude UX.

- [ ] **Step 2: Run targeted frontend tests to verify RED**

Run: `bun test tests/message-panel-view-model.test.ts src/components/ClaudePanel/launch-request.test.ts`
Expected: FAIL on old channel/terminal expectations.

- [ ] **Step 3: Remove/replace legacy PTY-facing Claude UI state**

Delete channel-preview copy, stop gating Claude connect button on `claudeTerminalRunning`, and remove embedded terminal affordances that still imply interactive PTY control.

- [ ] **Step 4: Run targeted frontend tests to verify GREEN**

Run: `bun test tests/message-panel-view-model.test.ts src/components/ClaudePanel/launch-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentStatus/index.tsx \
        src/components/ClaudePanel/index.tsx \
        src/components/ClaudePanel/ClaudeHint.tsx \
        src/components/MessagePanel/index.tsx \
        src/components/MessagePanel/view-model.ts \
        src/stores/bridge-store/types.ts \
        src/stores/bridge-store/index.ts \
        src/stores/bridge-store/listener-setup.ts \
        tests/message-panel-view-model.test.ts \
        src/components/ClaudePanel/launch-request.test.ts
git commit -m "refactor: remove Claude channel terminal UI"
```

### Task 2: Route every Claude resume path through the SDK launcher

**Files:**
- Modify: `src-tauri/src/daemon/mod.rs`
- Modify: `src-tauri/src/daemon/provider/claude.rs`
- Test: `src-tauri/src/daemon/routing_tests.rs`
- Test: `src-tauri/src/daemon/state_tests.rs`
- Test: `src-tauri/src/daemon/mod.rs` or a new focused daemon test module if extraction is needed

- [ ] **Step 1: Write failing Rust tests for Claude resume/history attach staying on SDK**

Add coverage around any extracted helper or launch-decision logic so Claude provider history attach and normalized session resume no longer call legacy `claude_launch::resume`.

- [ ] **Step 2: Run focused Rust tests to verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml claude_sdk -- --nocapture`
Expected: FAIL until resume/attach behavior is updated or new helper exists.

- [ ] **Step 3: Replace legacy Claude resume/attach launches with SDK launch**

Update daemon resume handling to use `launch_claude_sdk(..., resume_session_id=Some(external_id))`, preserve provider/task-graph metadata, and stop calling the PTY channel launcher for Claude history/session recovery.

- [ ] **Step 4: Run focused Rust tests to verify GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml claude_sdk -- --nocapture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/daemon/mod.rs \
        src-tauri/src/daemon/provider/claude.rs \
        src-tauri/src/daemon/routing_tests.rs \
        src-tauri/src/daemon/state_tests.rs
git commit -m "refactor: resume Claude sessions via sdk"
```

### Task 3: Remove user-facing runtime entry points for PTY/channel Claude control

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/mcp.rs`
- Test: `cargo test --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 1: Write failing verification notes/checklist for legacy command exposure**

Identify the remaining Tauri commands and managed state that still expose `launch_claude_terminal`, `claude_terminal_input`, and `claude_terminal_resize` to the frontend/runtime.

- [ ] **Step 2: Remove legacy runtime registrations**

Unregister legacy Claude terminal commands from Tauri, simplify shutdown/disconnect behavior so SDK is the supported Claude path, and keep any leftover PTY code isolated as dormant implementation detail only if still needed for compilation.

- [ ] **Step 3: Run full Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/src/commands.rs src-tauri/src/mcp.rs
git commit -m "refactor: remove Claude channel runtime entrypoints"
```

### Task 4: Refresh docs, run full verification, then perform deep review

**Files:**
- Modify: `docs/agents/claude-chain.md`
- Modify: `docs/agents/claude-sdk-url-validation.md`
- Modify: `docs/claude-code-integration-alternatives.md`

- [ ] **Step 1: Update the living docs**

Record that Claude is now SDK-first for launch/resume/runtime, and explicitly call out any remaining dormant legacy code if not yet deleted.

- [ ] **Step 2: Run complete verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `231 passed` or current total with `0 failed`

Run: `bun test`
Expected: all frontend tests pass

Run: `bun x tsc --noEmit`
Expected: exit code 0

- [ ] **Step 3: Perform deep code review**

Review the complete diff with a code-review mindset focused on regressions, incomplete migration edges, UI drift, and leftover runtime entry points that still allow channel/PTTY behavior to leak back in.

- [ ] **Step 4: Fix any issues found in review and re-run impacted verification**

Re-run the smallest failing/impacted verification first, then rerun the full suite once the fixes land.

- [ ] **Step 5: Commit**

```bash
git add docs/agents/claude-chain.md \
        docs/agents/claude-sdk-url-validation.md \
        docs/claude-code-integration-alternatives.md
git commit -m "docs: document full Claude sdk regression"
```
