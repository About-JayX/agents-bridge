#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod claude_cli;
mod codex;
mod daemon;
mod mcp;

use codex::auth::CodexProfile;
use codex::models::CodexModel;
use codex::oauth::{OAuthHandle, OAuthLaunchInfo};
use codex::usage::UsageSnapshot;
use daemon::{
    types::{BridgeMessage, DaemonStatusSnapshot, PermissionBehavior},
    DaemonCmd,
};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::mpsc;

// ── Daemon command sender ────────────────────────────────────────────────────

struct DaemonSender(mpsc::Sender<DaemonCmd>);

#[derive(Default)]
struct ExitState(AtomicBool);

fn request_app_shutdown(app: tauri::AppHandle) {
    if app.state::<ExitState>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    let sender = app.state::<DaemonSender>().0.clone();
    tauri::async_runtime::spawn(async move {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        if sender
            .send(DaemonCmd::Shutdown { reply: reply_tx })
            .await
            .is_ok()
        {
            let _ = reply_rx.await;
        }
        app.exit(0);
    });
}

// ── Codex / account commands ─────────────────────────────────────────────────

#[tauri::command]
fn get_codex_account() -> Result<CodexProfile, String> {
    codex::auth::read_profile()
}

#[tauri::command]
async fn refresh_usage() -> Result<UsageSnapshot, String> {
    codex::usage::get_snapshot().await
}

#[tauri::command]
fn list_codex_models() -> Result<Vec<CodexModel>, String> {
    codex::models::list_models()
}

#[tauri::command]
async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()));
    });
    rx.await.map_err(|_| "dialog cancelled".to_string())
}

// ── Daemon messaging commands ─────────────────────────────────────────────────

#[tauri::command]
async fn daemon_send_message(
    msg: BridgeMessage,
    sender: State<'_, DaemonSender>,
) -> Result<(), String> {
    sender
        .0
        .send(DaemonCmd::SendMessage(msg))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn daemon_launch_codex(
    role_id: String,
    cwd: String,
    model: Option<String>,
    sender: State<'_, DaemonSender>,
) -> Result<(), String> {
    eprintln!("[Tauri] daemon_launch_codex called: role={role_id} cwd={cwd} model={model:?}");
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    sender
        .0
        .send(DaemonCmd::LaunchCodex {
            role_id,
            cwd,
            model,
            reply: reply_tx,
        })
        .await
        .map_err(|e| e.to_string())?;
    reply_rx
        .await
        .map_err(|_| "daemon dropped codex launch result".to_string())?
}

#[tauri::command]
async fn daemon_stop_codex(sender: State<'_, DaemonSender>) -> Result<(), String> {
    sender
        .0
        .send(DaemonCmd::StopCodex)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn daemon_set_claude_role(
    role: String,
    sender: State<'_, DaemonSender>,
) -> Result<(), String> {
    sender
        .0
        .send(DaemonCmd::SetClaudeRole(role))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn daemon_respond_permission(
    request_id: String,
    behavior: PermissionBehavior,
    sender: State<'_, DaemonSender>,
) -> Result<(), String> {
    sender
        .0
        .send(DaemonCmd::RespondPermission {
            request_id,
            behavior,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn daemon_get_status_snapshot(
    sender: State<'_, DaemonSender>,
) -> Result<DaemonStatusSnapshot, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    sender
        .0
        .send(DaemonCmd::ReadStatusSnapshot { reply: reply_tx })
        .await
        .map_err(|e| e.to_string())?;
    reply_rx
        .await
        .map_err(|_| "daemon dropped status snapshot reply".to_string())
}

// ── Auth / OAuth commands ─────────────────────────────────────────────────────

#[tauri::command]
async fn codex_login(app: tauri::AppHandle) -> Result<OAuthLaunchInfo, String> {
    let handle = app.state::<Arc<OAuthHandle>>();
    codex::oauth::start_login(handle.inner().clone()).await
}

#[tauri::command]
fn codex_cancel_login(app: tauri::AppHandle) -> bool {
    app.state::<Arc<OAuthHandle>>().cancel()
}

#[tauri::command]
async fn codex_logout() -> Result<(), String> {
    codex::oauth::do_logout().await
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(OAuthHandle::new()))
        .manage(ExitState::default())
        .setup(|app| {
            // Create channel synchronously so DaemonSender is available immediately.
            // If manage() were called inside an async spawn, any command arriving
            // before the spawn completes would panic with "state not managed".
            let (cmd_tx, cmd_rx) = daemon::channel();
            app.handle().manage(DaemonSender(cmd_tx));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(daemon::run(handle, cmd_rx));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .app_handle()
                    .state::<ExitState>()
                    .0
                    .load(Ordering::SeqCst)
                {
                    return;
                }
                api.prevent_close();
                request_app_shutdown(window.app_handle().clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_codex_account,
            refresh_usage,
            list_codex_models,
            pick_directory,
            mcp::register_mcp,
            mcp::check_mcp_registered,
            mcp::launch_claude_terminal,
            codex_login,
            codex_cancel_login,
            codex_logout,
            daemon_send_message,
            daemon_launch_codex,
            daemon_stop_codex,
            daemon_set_claude_role,
            daemon_respond_permission,
            daemon_get_status_snapshot,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if app_handle.state::<ExitState>().0.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            request_app_shutdown(app_handle.clone());
        }
    });
}
