// Entry point — delegates to api_vault_app::run()
// Keeps the binary target where Tauri CLI expects it (src-tauri/src/main.rs)
// while the actual runtime logic lives in the api-vault-app library crate.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    api_vault_app::run();
}
