// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod commands;
pub mod context;
pub mod setup;

use commands::credentials::{
    credential_create, credential_delete, credential_get, credential_list, credential_reveal,
    credential_update,
};
use commands::issuer::{issuer_get, issuer_list};
use commands::vault::{vault_init, vault_lock, vault_status, vault_unlock};
use context::AppContext;
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
            credential_create,
            credential_list,
            credential_get,
            credential_update,
            credential_delete,
            credential_reveal,
            credential_copy_to_clipboard,
            issuer_list,
            issuer_get,
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
            credential_create,
            credential_list,
            credential_get,
            credential_update,
            credential_delete,
            credential_reveal,
            issuer_list,
            issuer_get,
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

    builder
        .run(context)
        .expect("error while running tauri application");
}
