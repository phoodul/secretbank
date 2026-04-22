fn main() {
    // tauri-build reads tauri.conf.json from env::current_dir().
    // When building from a workspace sub-crate, current_dir points to the
    // crate root (crates/api-vault-app/). We need to change it to the
    // src-tauri/ workspace root where tauri.conf.json actually lives.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let workspace_root = std::path::Path::new(&manifest_dir)
        .parent() // crates/
        .unwrap()
        .parent() // src-tauri/
        .unwrap()
        .to_path_buf();
    std::env::set_current_dir(&workspace_root).unwrap();

    tauri_build::build()
}
