---
name: deploy
description: Build release binaries for all platforms
disable-model-invocation: true
allowed-tools: Bash(cargo *) Bash(npm *)
---

릴리스 빌드:

1. `npm run test` — 프론트엔드 테스트
2. `cargo test` — Rust 테스트
3. `cargo clippy -- -D warnings` — 경고 없는지 확인
4. `cargo tauri build` — 릴리스 빌드

출력:

- Windows: `src-tauri/target/release/bundle/msi/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/appimage/`

$ARGUMENTS가 있으면 대상 플랫폼으로 사용.
