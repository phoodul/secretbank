# API Vault

The secrets manager that understands your dependency graph.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![CI](https://github.com/api-vault/api-vault/actions/workflows/ci.yml/badge.svg)

## About

API Vault is an open-core desktop and mobile application that goes beyond simple secret storage.
It maps how API keys relate to your projects, deployments, and URLs — so you always know the
blast radius before you rotate or revoke a key. When a provider reports a breach, API Vault
matches it to your vault automatically and surfaces exactly which services are at risk.

## Features (MVP)

- **Zero-Knowledge vault** — secrets are encrypted on-device; the relay server never sees plaintext
- **Dependency graph** — visual map of Issuer → Credential → Usage → Project → Deployment → URL
- **Blast radius preview** — simulate what breaks before you revoke a key
- **Incident feed** — auto-match NVD/GitHub Advisory alerts to credentials in your vault
- **Kill Switch** — one-click revoke with two-step confirmation (free tier)
- **RAILGUARD** — auto-generate `.cursorrules` / `CLAUDE.md` / Copilot instructions for AI editors
- **Multi-device E2EE sync** — Yjs + SecSync delta CRDT over a Cloudflare Workers relay
- **Open Core** — local vault and graph engine are AGPL-3.0; premium connectors and relay are EE

## Tech Stack

| Layer                | Technology                                    |
| :------------------- | :-------------------------------------------- |
| Desktop/Mobile shell | Tauri v2 (Rust backend + Web frontend)        |
| Backend              | Rust (tokio, sqlx, age, reqwest)              |
| Frontend             | React 19 + TypeScript                         |
| Styling              | Tailwind CSS v4 + shadcn/ui + Radix UI        |
| Database             | SQLite (local, via tauri-plugin-sql)          |
| Encryption           | age crate (X25519 + ChaCha20-Poly1305)        |
| Sync                 | Yjs / SecSync CRDT + Cloudflare Workers relay |

## Platforms

| Platform                | Status      |
| :---------------------- | :---------- |
| Windows / macOS / Linux | MVP (M0–M8) |
| iOS / Android           | MVP (M11)   |
| Read-only Web viewer    | MVP (M12)   |

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Rust stable](https://rustup.rs/) — `rustup install stable`
- [pnpm](https://pnpm.io/) — `npm install -g pnpm`
- [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/)

### Development

```sh
pnpm install
pnpm tauri dev        # desktop (hot reload)
```

Mobile (available from M11):

```sh
pnpm tauri android dev
pnpm tauri ios dev
```

### Production build

```sh
pnpm tauri build
```

## Development Commands

| Command                                                                        | Description           |
| :----------------------------------------------------------------------------- | :-------------------- |
| `cargo test --workspace --manifest-path src-tauri/Cargo.toml`                  | Rust unit tests       |
| `cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings` | Rust lint             |
| `pnpm typecheck`                                                               | TypeScript type check |
| `pnpm lint`                                                                    | ESLint                |
| `pnpm format`                                                                  | Prettier format       |

Architecture and task details: [`docs/architecture.md`](./docs/architecture.md) · [`docs/task.md`](./docs/task.md)

## License

This project is licensed under the **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**.
See [LICENSE](./LICENSE) and [LICENSE_FAQ.md](./LICENSE_FAQ.md) for details, including the boundary
between the open-source core and the Enterprise Edition.

## Contributing

All contributors must sign the [Contributor License Agreement](./.github/CLA.md) before a pull request
can be merged. When you open a PR, the CLA bot will guide you through the process.

---

## 한국어 요약

API Vault는 API 키를 단순 보관하는 것을 넘어 **의존성 그래프**를 통해 "어떤 키가 어느 프로젝트·배포 환경에 쓰이고,
폐기 시 무엇이 깨지는지"를 추적합니다. 로컬 볼트는 `age` 암호화로 보호되며, 서버는 암호문만 릴레이하는
**Zero-Knowledge 아키텍처**를 사용합니다. 데스크톱(Windows/macOS/Linux)과 모바일(iOS/Android)을 동시 지원하고,
월 $2 Pro 플랜으로 멀티 디바이스 E2EE 동기화를 제공합니다. 코어는 **AGPL-3.0 오픈소스**이며,
프리미엄 커넥터·자동 rotation 등은 EE 독점 라이선스로 별도 제공됩니다.
