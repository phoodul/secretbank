# Antigravity Overrides (Tauri + Rust + React)

## Stack
- Tauri v2, Rust backend, React + TypeScript frontend, Tailwind CSS

## Rules
- Rust backend: file system, system APIs, heavy computation
- Frontend: UI rendering, user interaction
- Communication via Tauri commands (#[tauri::command])
- Never use unsafe Rust without justification
- Never hardcode file paths — use Tauri path API
- Minimize IPC calls — batch data when possible

## Commands
- Dev: `cargo tauri dev`
- Build: `cargo tauri build`
- Rust test: `cargo test`
- Frontend test: `npm run test`
- Rust lint: `cargo clippy`
