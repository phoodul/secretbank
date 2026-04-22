// Entry point — delegates to api_vault_app::run()
// Keeps the binary target where Tauri CLI expects it (src-tauri/src/main.rs)
// while the actual runtime logic lives in the api-vault-app library crate.
//
// `generate_context!` must run here (root crate) because `tauri_build::build()`
// emits `gen/schemas/` into THIS crate's OUT_DIR. Calling it from the subcrate
// misses the plugin ACL manifests and results in "Plugin not found" at runtime.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    api_vault_app::run(tauri::generate_context!());
}
