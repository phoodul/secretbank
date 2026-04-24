// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod commands;
pub mod context;
pub mod services;
pub mod setup;

use commands::credentials::{
    credential_create, credential_delete, credential_get, credential_list, credential_reveal,
    credential_update,
};
use commands::graph::{blast_radius_for_credential, graph_fetch};
use commands::incidents::{
    incident_dismiss, incident_feed_refresh, incident_list, incident_matches_for_credential,
};
use commands::issuer::{issuer_get, issuer_list};
use commands::deployments::{
    deployment_create, deployment_delete, deployment_list_for_project, deployment_update,
};
use commands::projects::{
    project_create, project_delete, project_get, project_list, project_update,
};
use commands::scanner::env_scan_folder;
use commands::settings::{settings_get, settings_set};
use commands::usage::{
    usage_create, usage_delete, usage_list_for_credential, usage_list_for_project,
};
use commands::vault::{vault_init, vault_lock, vault_status, vault_unlock};
use commands::vault_settings::{vault_setting_get, vault_setting_set};
use commands::railguard::{railguard_apply, railguard_preview};
use context::AppContext;
use services::feed_scheduler::{spawn_feed_scheduler, FeedSchedulerConfig, TauriEmitter};
use tauri::Manager;

#[cfg(feature = "tauri-plugins")]
use commands::clipboard::credential_copy_to_clipboard;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(context: tauri::Context) {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let ctx = tauri::async_runtime::block_on(AppContext::new(data_dir))
                .expect("failed to initialise AppContext");

            let seed_count = tauri::async_runtime::block_on(setup::seed_issuer_presets(&ctx.pool))
                .expect("failed to seed issuer presets");
            tracing::info!("issuer preset seed: {} rows inserted", seed_count);

            // 피드 스케줄러 시작 (기본값: RSS 만 활성, NVD/GHSA 는 API key 없으면 비활성)
            // `spawn_feed_scheduler` 내부 `JoinSet::spawn` 은 tokio 런타임 context 를
            // 동기적으로 요구하므로 반드시 `block_on` 안에서 호출한다.
            let scheduler_config = FeedSchedulerConfig {
                emitter: Some(std::sync::Arc::new(TauriEmitter::new(app.handle().clone()))),
                ..Default::default()
            };
            tauri::async_runtime::block_on(async {
                let scheduler_handle = spawn_feed_scheduler(ctx.pool.clone(), scheduler_config);
                *ctx.feed_scheduler.lock().await = Some(scheduler_handle);
            });

            app.manage(ctx);
            Ok(())
        });

    #[cfg(feature = "tauri-plugins")]
    {
        builder = builder
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(tauri_plugin_shell::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_http::init());
    }

    // tauri-plugins feature 에 따라 등록하는 커맨드가 달라진다.
    // generate_handler! 내부에서는 cfg 속성을 사용할 수 없으므로 두 블록으로 분리한다.
    #[cfg(feature = "tauri-plugins")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            greet,
            vault_init,
            vault_unlock,
            vault_lock,
            vault_status,
            vault_setting_get,
            vault_setting_set,
            credential_create,
            credential_list,
            credential_get,
            credential_update,
            credential_delete,
            credential_reveal,
            credential_copy_to_clipboard,
            issuer_list,
            issuer_get,
            project_create,
            project_list,
            project_get,
            project_update,
            project_delete,
            deployment_create,
            deployment_list_for_project,
            deployment_update,
            deployment_delete,
            usage_create,
            usage_delete,
            usage_list_for_credential,
            usage_list_for_project,
            settings_get,
            settings_set,
            env_scan_folder,
            graph_fetch,
            blast_radius_for_credential,
            incident_list,
            incident_dismiss,
            incident_matches_for_credential,
            incident_feed_refresh,
            railguard_preview,
            railguard_apply,
        ]);
    }

    #[cfg(not(feature = "tauri-plugins"))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            greet,
            vault_init,
            vault_unlock,
            vault_lock,
            vault_status,
            vault_setting_get,
            vault_setting_set,
            credential_create,
            credential_list,
            credential_get,
            credential_update,
            credential_delete,
            credential_reveal,
            issuer_list,
            issuer_get,
            project_create,
            project_list,
            project_get,
            project_update,
            project_delete,
            deployment_create,
            deployment_list_for_project,
            deployment_update,
            deployment_delete,
            usage_create,
            usage_delete,
            usage_list_for_credential,
            usage_list_for_project,
            settings_get,
            settings_set,
            env_scan_folder,
            graph_fetch,
            blast_radius_for_credential,
            incident_list,
            incident_dismiss,
            incident_matches_for_credential,
            incident_feed_refresh,
            railguard_preview,
            railguard_apply,
        ]);
    }

    #[cfg(all(
        feature = "tauri-plugins",
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    #[cfg(all(
        feature = "tauri-plugins",
        any(target_os = "android", target_os = "ios")
    ))]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    let app = builder
        .build(context)
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<AppContext>();
            let scheduler_arc = state.feed_scheduler.clone();
            tauri::async_runtime::block_on(async move {
                let mut guard = scheduler_arc.lock().await;
                if let Some(handle) = guard.take() {
                    handle.shutdown().await;
                }
            });
        }
    });
}
