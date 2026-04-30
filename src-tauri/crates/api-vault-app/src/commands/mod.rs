pub mod audit;
pub mod auth;
pub mod charter_cooldown;
pub mod credentials;
pub mod entitlement;
pub mod github;
pub mod kill_switch;
pub mod deployments;
pub mod graph;
pub mod incidents;
pub mod issuer;
pub mod pairing;
pub mod projects;
pub mod railguard;
pub mod scanner;
pub mod settings;
pub mod supply;
pub mod sync;
pub mod usage;
pub mod vault;
pub mod vault_settings;

// 클립보드 커맨드는 tauri-plugin-clipboard-manager 가 활성화된 빌드에서만 컴파일
#[cfg(feature = "tauri-plugins")]
pub mod clipboard;
