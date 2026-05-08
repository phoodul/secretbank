# Developer Setup Guide

A new developer (or future you) should be able to get a working local environment in under 10 minutes after reading this document.

---

## Prerequisites

### Required for everyone

| Tool                     | Version | Install                                       |
| :----------------------- | :------ | :-------------------------------------------- |
| **Node.js**              | 20+     | https://nodejs.org or `nvm install 20`        |
| **pnpm**                 | 10+     | `npm i -g pnpm`                               |
| **Rust** (stable)        | 1.80+   | `rustup install stable` via https://rustup.rs |
| **Tauri v2 system deps** | —       | see platform sections below                   |

### Windows

1. **Visual Studio Build Tools 2022** — C++ workload required for Rust compilation.
   - Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
   - Required components: "Desktop development with C++" workload
2. **WebView2** — shipped by default on Windows 10 (1803+) and Windows 11. If missing, download the Evergreen Bootstrapper from https://developer.microsoft.com/microsoft-edge/webview2/
3. Full Tauri prereqs: https://v2.tauri.app/start/prerequisites/

### macOS

1. **Xcode Command Line Tools**: `xcode-select --install`
2. Full Tauri prereqs: https://v2.tauri.app/start/prerequisites/

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libgtk-3-dev \
  pkg-config \
  curl \
  wget \
  file
```

Full Tauri prereqs: https://v2.tauri.app/start/prerequisites/

---

## First-time Setup

```bash
# 1. Clone the repository
git clone https://github.com/phoodul/secretbank.git
cd secretbank

# 2. Install frontend dependencies
pnpm install

# 3. (Optional) Warm up the Rust build cache — this takes 2-5 min on first run
cargo build --workspace --manifest-path src-tauri/Cargo.toml
```

That's it. The Rust workspace has 9 crates; the first build downloads all crate dependencies from crates.io.

---

## Daily Development

### Desktop (primary target)

```bash
pnpm tauri dev
```

This runs Vite dev server + Tauri shell in parallel with hot reload. Both frontend (HMR) and Rust backend (recompile on change) are watched automatically.

### Frontend only (no Tauri shell)

```bash
pnpm dev
```

Opens the Vite dev server on `http://localhost:1420`. Useful for pure UI work without Rust compilation overhead. Tauri IPC calls will fail gracefully with console warnings.

### Mobile and Web

Mobile (iOS/Android) and web targets are introduced in M11 and M12 respectively. Until then, use the desktop target for all development.

---

## Testing & QA

### Frontend

```bash
# TypeScript type checking
pnpm typecheck

# ESLint
pnpm lint

# ESLint with auto-fix
pnpm lint:fix

# Prettier formatting check
pnpm format:check

# Prettier auto-fix
pnpm format
```

### Rust backend

```bash
# Unit + integration tests
cargo test --workspace --manifest-path src-tauri/Cargo.toml

# Lint (deny all warnings in CI)
cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings

# Format check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check

# Auto-format
cargo fmt --all --manifest-path src-tauri/Cargo.toml
```

### CI equivalent (run before opening a PR)

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --workspace --manifest-path src-tauri/Cargo.toml
pnpm typecheck
pnpm lint
pnpm format:check
```

These are the same checks the GitHub Actions CI runs on every push (`.github/workflows/ci.yml`).

---

## Folder Layout

```
secretbank/
├── src/                        # React + TypeScript frontend
│   ├── App.tsx                 # Router root (BrowserRouter + 5 routes)
│   ├── main.tsx                # Entry point (ThemeProvider, i18n init)
│   ├── components/
│   │   ├── shell/              # AppShell, Sidebar, BottomNav
│   │   ├── theme/              # ThemeProvider, useTheme
│   │   └── ui/                 # shadcn/ui primitives (copy-paste)
│   ├── lib/
│   │   ├── i18n.ts             # i18next init (en/ko/ja)
│   │   ├── platform.ts         # Platform detection (desktop/mobile/web)
│   │   └── utils.ts            # cn() helper
│   ├── locales/                # Translation JSON files
│   │   ├── en/common.json
│   │   ├── ko/common.json
│   │   └── ja/common.json
│   ├── pages/                  # Route-level page components
│   └── styles/globals.css      # Tailwind v4 + semantic color tokens
│
├── src-tauri/                  # Rust/Tauri backend
│   ├── Cargo.toml              # Workspace root (resolver = "2")
│   ├── tauri.conf.json         # Tauri app configuration
│   ├── capabilities/           # Permission declarations
│   └── crates/
│       ├── secretbank-app/      # Tauri entry point (bin + lib)
│       ├── secretbank-core/     # Domain types and business logic
│       ├── secretbank-storage/  # SQLite persistence layer
│       ├── secretbank-crypto/   # age encryption + key management
│       ├── secretbank-audit/    # ed25519 audit log chain
│       ├── secretbank-feeds/    # NVD / GitHub Advisory incident feeds
│       ├── secretbank-connectors/ # GitHub, Vercel, etc. connectors
│       ├── secretbank-railguard/ # AI editor rules generator
│       └── secretbank-sync/     # CRDT + E2EE sync (Yjs/SecSync)
│
├── docs/                       # Project documentation (see Docs Index below)
├── .github/
│   ├── workflows/ci.yml        # CI: Rust lint/test + frontend typecheck/lint
│   └── workflows/cla.yml       # CLA bot for contributors
└── package.json                # Frontend scripts (dev/build/lint/format/typecheck)
```

For detailed module boundaries and data models, see `docs/architecture.md` (sections 3–4).

---

## Common Troubleshooting

### Windows: Rust build blocked by AppLocker / Defender

Some crates run build scripts (`build.rs`) that compile small helper binaries. Windows AppLocker policies may block these under `%USERPROFILE%\.cargo\registry\` or the `target/` directory.

**Symptoms:** `cargo build` fails with `OS error 4551` or `Access is denied`.

**Fix (developer machine only):** Add a Defender exclusion for the build output directory:

```powershell
# Run in PowerShell as Administrator
Add-MpPreference -ExclusionPath "C:\Users\<you>\Projects\secretbank\src-tauri\target"
Add-MpPreference -ExclusionPath "C:\Users\<you>\.cargo\registry"
```

**History:** `tauri-plugin-stronghold` (dependency `libsodium-sys-stable`) triggered this exact issue and was replaced with the `age` crate. If you add a new crate that has a C build dependency, test it in an AppLocker-restricted environment first.

### `pnpm install` fails or packages are corrupted

```bash
# Clear the pnpm store and reinstall
pnpm store prune
rm -rf node_modules
pnpm install
```

If the problem persists, try clearing the full store:

```bash
pnpm store clear
pnpm install
```

### Tauri `gen/` directory is stale or corrupted

After pulling a branch with significant `tauri.conf.json` changes, the `gen/` directory (auto-generated Xcode/Android Studio project files) may be out of sync.

```bash
# Delete generated files and rebuild
rm -rf src-tauri/gen
cargo clean --manifest-path src-tauri/Cargo.toml
pnpm tauri dev   # or: pnpm tauri build
```

### TypeScript path alias `@/` not resolving

The `@/` alias points to `src/`. It is configured in two places — both must be consistent:

- `tsconfig.json` → `"paths": { "@/*": ["src/*"] }`
- `vite.config.ts` → `resolve.alias['@']`

If one is missing after a merge conflict, restore both.

### Hot reload stops working (Vite HMR)

Restart the dev server:

```bash
# Ctrl+C to stop, then:
pnpm tauri dev
```

If the Tauri window opened but shows a blank page, check that Vite is fully started before the shell tries to connect (usually resolves itself within a few seconds).

### `cargo test` panics on first run

The first test run on a fresh machine may fail if the SQLite database file path cannot be created. Ensure the Tauri `app_data_dir` is accessible, or run with `RUST_LOG=debug` to see the exact path:

```bash
RUST_LOG=debug cargo test --workspace --manifest-path src-tauri/Cargo.toml 2>&1 | head -60
```

---

## Docs Index

| File                          | Purpose                                                                  |
| :---------------------------- | :----------------------------------------------------------------------- |
| `docs/project-decisions.md`   | All confirmed architectural decisions (do not change without discussion) |
| `docs/architecture.md`        | System design: data model, module boundaries, security, platform matrix  |
| `docs/task.md`                | Full task list — 118 tasks across 14 milestones (M0–M13)                 |
| `docs/implementation_plan.md` | Milestone-by-milestone execution plan with risk mitigation               |
| `docs/progress.md`            | Current workflow state and what was last completed                       |
| `docs/work-log.md`            | Chronological log of significant changes                                 |
| `docs/ux_research.md`         | UX option analysis (Option A "Security Minimal" selected)                |
| `docs/research_raw.md`        | Raw research notes: 14 topics, 48 sources                                |
| `docs/integrator_report.md`   | CRAAP evaluation + MoSCoW classification of research findings            |

---

## 한국어 요약

**Secretbank 로컬 개발 환경 세팅 (5단계):**

1. **필수 도구 설치:** Node.js 20+, pnpm, Rust stable (rustup), 플랫폼별 시스템 의존성 (Windows: VS Build Tools + WebView2 / macOS: Xcode CLI / Linux: webkit2gtk + build-essential)
2. **저장소 클론 후:** `pnpm install` → 프론트엔드 의존성 설치
3. **첫 Rust 빌드 (선택):** `cargo build --workspace --manifest-path src-tauri/Cargo.toml` — 최초 실행 시 2-5분 소요, 이후엔 빠름
4. **개발 서버 시작:** `pnpm tauri dev` — Vite HMR + Tauri 셸 동시 실행
5. **PR 전 필수 검증:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `cargo clippy -- -D warnings`, `cargo test --workspace`

문제가 생기면 Troubleshooting 섹션과 `docs/project-decisions.md` (특히 "AppLocker 이슈"와 "Stronghold → age 교체" 섹션)를 먼저 확인하세요.
