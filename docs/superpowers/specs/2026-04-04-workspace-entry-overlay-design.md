# Workspace Entry Overlay Design

## Summary

Dimweave should stop asking Claude and Codex to choose a workspace independently. Workspace becomes a shell-level concept owned by the app itself. When the app opens with no active task, the user sees a blocking entry overlay, selects exactly one workspace, then clicks `Continue` to create a fresh task context and enter the main UI.

After entry, the same workspace model remains available in the top-right shell control. Agent panels no longer own workspace selection. They only display and consume the active task workspace for provider history lookup and launch configuration.

## Product Goal

- Remove duplicated workspace selection from individual agent panels.
- Make every app launch start from a fresh shell context.
- Keep recent workspaces as shortcuts only, not sticky auto-restore state.
- Ensure the shell always has one authoritative workspace selection path.

## MVP Scope

### Included

- A blocking entry overlay shown when there is no active task.
- A single-selection model:
  - one manually chosen folder, or
  - one recent workspace entry
- A disabled `Continue` button until exactly one workspace is selected.
- Recent workspace shortcuts persisted locally and deduplicated.
- A compact top-right workspace switcher after entering the shell.
- Agent panels switched to read-only workspace display.

### Excluded

- Multi-workspace tabs.
- Restoring the last workspace automatically.
- Workspace-specific onboarding, templates, or project metadata.
- Cross-device sync for recent workspaces.

## User Flow

### App launch

1. App enters a short bootstrap phase before rendering any interactive workspace-dependent UI.
2. During bootstrap, the frontend explicitly calls a new daemon command, `daemon_clear_active_task`, to clear the active task selection for the new app session.
3. Only after that clear succeeds does the frontend request `daemon_get_task_snapshot`.
4. Task records may still exist in persistence, but the new session starts with no active task selected.
5. If there is no active task, a blocking overlay covers the main surface.
6. The overlay shows:
   - centered logo
   - product name
   - short description
   - `Choose folder...`
   - `Recent workspaces` list when available
   - `Continue`
7. User selects exactly one workspace candidate.
8. User clicks `Continue`.
9. The app creates and selects a fresh task for that workspace, using the workspace basename as the initial task title and falling back to the full path only when no basename exists.
10. The app dismisses the overlay.
11. If task creation fails, the overlay stays open, the selected candidate remains selected, recent history is not mutated, and the UI shows an inline error.
12. If `daemon_clear_active_task` fails during bootstrap, the app stays in a blocking bootstrap error state and does not fall back to a stale snapshot.
13. If `daemon_get_task_snapshot` fails during bootstrap, the app also stays in the same blocking bootstrap error state.

### Post-entry workspace switching

1. Top-right shell workspace control shows the current workspace.
2. Clicking it opens a compact switcher using the same candidate model:
   - choose folder
   - recent workspaces
   - one selected candidate at a time
3. Confirming the selection creates a new task context for the chosen workspace instead of mutating the current task in place.
4. A successful switch also appends that workspace to recent history.
5. If task creation fails, the switcher stays open, the selected candidate remains selected, recent history is not mutated, and the UI shows an inline error.

## Interaction Rules

### Single-selection rule

Only one workspace candidate may be active at a time.

- If the user chooses a folder, any selected recent workspace is cleared.
- If the user selects a recent workspace, any previously chosen folder is cleared.
- `Continue` always applies to the one selected candidate.
- A workspace is added to recent history only after `Continue` succeeds, not at selection time.

### Fresh-start rule

The app must not auto-enter the last workspace from a previous launch. The entry overlay is the explicit start point for a new session. Recent workspaces are offered only as shortcuts.

### Task ownership rule

Workspace belongs to the shell task context, not to Claude or Codex.

- `App` and the task store own entry and switching.
- Claude/Codex panels read the active task workspace as the only authoritative workspace source after entry.
- Provider history queries are scoped by the active task workspace.
- Switching to a new workspace creates and selects a new task, but does not implicitly stop or mutate older tasks or provider sessions.

## UI Structure

### Entry overlay

- Full-screen overlay above the shell surface
- Dimmed or softened background, but no underlying interaction
- Centered card with vertical layout
- Primary visual hierarchy:
  - logo
  - product name
  - one-line description
  - folder chooser
  - recent workspace list
  - continue button

### Top-right switcher

- Replaces the passive workspace label in `ShellTopBar`
- Compact button/popover, not a full modal
- Reuses the same workspace candidate and recent history model as the entry overlay

## Data and Persistence

### Active workspace

No standalone persisted "current workspace" is needed for MVP. Entering a workspace immediately creates a fresh task, and the active task becomes the source of truth for the current workspace label.

### Recent workspaces

Persist a small local history list in `localStorage`.

Requirements:

- use the storage key `dimweave:recent-workspaces`
- store raw absolute paths returned by the picker or stored history
- deduplicate by raw string equality for MVP, without filesystem canonicalization
- most recent first
- cap to 6 entries
- treat invalid or corrupted stored data as an empty list
- serialize as a JSON array of strings

## Frontend Architecture

### New UI units

- `WorkspaceEntryOverlay`
  - renders the startup gate
  - owns folder pick + recent selection callbacks
- `WorkspaceSwitcher`
  - compact top-right variant for post-entry switching
- `workspace-entry-state`
  - pure helpers for:
    - candidate selection
    - localStorage normalization
    - recent workspace insert/dedupe/cap

### Existing units to modify

- `App.tsx`
  - gate the main chat flow behind the overlay when no active task exists
  - create/select a task on continue
- `ShellTopBar.tsx`
  - replace passive workspace pill with interactive switcher
- `ClaudePanel` and `CodexPanel`
  - remove per-panel folder picking
  - keep history resumes scoped by active workspace

## Testing Strategy

- pure helper tests for selection exclusivity and recent-history normalization
- overlay render tests for:
  - title and description
  - disabled `Continue` when nothing is selected
  - selected-state rendering
- top bar tests for empty vs active workspace label states
- regression tests confirming agent config panels no longer expose `Select project...`

## Acceptance Criteria

- On launch with no active task, the user sees a blocking workspace entry overlay.
- The overlay allows only one selected workspace candidate at a time.
- `Continue` remains disabled until one candidate is selected.
- Continuing creates a new active task for the selected workspace.
- The top-right workspace control remains available after entry.
- Choosing a new workspace from the top-right control creates a new task context.
- Claude and Codex panels no longer let the user choose separate workspaces.
- Recent workspace history is available as a shortcut list but never auto-restores the previous workspace.
