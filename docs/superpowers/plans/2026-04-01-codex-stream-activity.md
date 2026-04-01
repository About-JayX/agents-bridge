# Codex Stream Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Codex activity, reasoning summary, and command output in the transient stream indicator so users can see what Codex is doing in real time.

**Architecture:** Keep the current daemon-to-frontend `codex_stream` event path and enrich it with structured transient payloads. Use pure helpers for backend item-label mapping and frontend reducer updates so the new behavior can be tested without spinning up the whole app.

**Tech Stack:** Tauri 2, Rust async daemon, React 19, TypeScript, Zustand, Bun test runner

---

## Planned File Structure

### Backend modify

- `src-tauri/src/daemon/codex/session_event.rs` - map WS events to activity/reasoning/command output GUI payloads
- `src-tauri/src/daemon/codex/structured_output.rs` - accumulate reasoning summary text inside current-turn preview state
- `src-tauri/src/daemon/codex/structured_output_tests.rs` - preview/reasoning buffer tests
- `src-tauri/src/daemon/gui.rs` - codex stream payload enum

### Frontend modify

- `src/stores/bridge-store/types.ts` - codex transient stream fields
- `src/stores/bridge-store/index.ts` - initialize new fields
- `src/stores/bridge-store/listener-payloads.ts` - typed payload union additions
- `src/stores/bridge-store/listener-setup.ts` - reducer logic for new codex stream payloads
- `src/components/MessagePanel/CodexStreamIndicator.tsx` - render richer transient status

### Tests

- `src-tauri/src/daemon/codex/session_event.rs` - item label extraction tests
- `src-tauri/src/daemon/codex/structured_output_tests.rs` - reasoning accumulation/reset tests
- `src/stores/bridge-store/listener-setup.test.ts` - reducer behavior tests
- `src/components/MessagePanel/CodexStreamIndicator.test.tsx` - render/pulse behavior tests

---

### Task 1: Lock backend event mapping behind unit tests

**Files:**
- Modify: `src-tauri/src/daemon/codex/session_event.rs`
- Modify: `src-tauri/src/daemon/codex/structured_output_tests.rs`

- [ ] **Step 1: Add failing tests for activity label extraction from `commandExecution`, `fileChange`, `mcpToolCall`, `webSearch`, and `reasoning` items**
- [ ] **Step 2: Add failing tests for reasoning accumulation and reasoning reset in `StreamPreviewState`**
- [ ] **Step 3: Run `cargo test --manifest-path src-tauri/Cargo.toml daemon::codex` and confirm failure**
- [ ] **Step 4: Refactor backend mapping into pure helpers and make the tests pass**

### Task 2: Lock frontend reducer and indicator behavior behind tests

**Files:**
- Modify: `src/stores/bridge-store/listener-setup.ts`
- Create: `src/stores/bridge-store/listener-setup.test.ts`
- Modify: `src/components/MessagePanel/CodexStreamIndicator.tsx`
- Create: `src/components/MessagePanel/CodexStreamIndicator.test.tsx`

- [ ] **Step 1: Add failing reducer tests for activity storage, reasoning replacement, command output accumulation, and turn reset**
- [ ] **Step 2: Add a failing component test asserting the activity label renders and `animate-pulse` is absent when only activity is present**
- [ ] **Step 3: Run `bun test src/stores/bridge-store/listener-setup.test.ts src/components/MessagePanel/CodexStreamIndicator.test.tsx` and confirm failure**
- [ ] **Step 4: Make the reducer and component tests pass with the smallest implementation changes**

### Task 3: End-to-end verification and review

**Files:**
- Modify: `src-tauri/src/daemon/gui.rs`
- Modify: `src/stores/bridge-store/types.ts`
- Modify: `src/stores/bridge-store/index.ts`
- Modify: `src/stores/bridge-store/listener-payloads.ts`

- [ ] **Step 1: Re-run `cargo test --manifest-path src-tauri/Cargo.toml daemon::codex`**
- [ ] **Step 2: Re-run `bun test src/stores/bridge-store/listener-setup.test.ts src/components/MessagePanel/CodexStreamIndicator.test.tsx`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Review the final diff for UX regressions, especially stale stream state and activity-only pulse behavior**
