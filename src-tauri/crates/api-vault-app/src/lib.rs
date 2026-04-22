// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        // TODO(T003/T017): tauri-plugin-stronghold은 AppLocker 환경에서 libsodium/iota-crypto
        //   빌드 스크립트 실행이 차단됩니다. 사용자가 Windows Defender 예외를 추가한 후 활성화.
        //   활성화 방법: Cargo.toml의 tauri-plugin-stronghold 주석 해제 + 아래 .plugin() 주석 해제.
        // .plugin(
        //     tauri_plugin_stronghold::Builder::with_argon2(
        //         std::path::Path::new(".stronghold_salt"),
        //     )
        //     .build(),
        // )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![greet]);

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    builder
        .run(tauri::generate_context!("../../tauri.conf.json"))
        .expect("error while running tauri application");
}
