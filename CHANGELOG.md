# Changelog

All notable changes to API Vault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release of API Vault — a desktop secrets manager that maps how API
keys relate to your projects, deployments, and URLs, so you always know the blast
radius before you rotate or revoke a key.

### Added

#### M0 — Foundation (T001–T012)

- Tauri v2 desktop shell scaffolded with a Cargo workspace split between
  `app-shell`, `core`, `crypto`, `storage`, `connectors`, and `feeds` crates.
- Tauri v2 plugin set enabled (fs, dialog, clipboard-manager, notification,
  os, shell, store, biometric, updater).
- AGPL-3.0-or-later license, Contributor License Agreement, lint/CI workflows,
  and project README.
- shadcn/ui "New York" primitives (12 components) layered on Radix UI, with the
  vault semantic token ramp wired into Tailwind CSS v4 (`oklch` palette,
  light/dark CSS variables).
- React Router v7 application shell with i18n scaffolding (English, Korean,
  Simplified Chinese) and a developer guide.

#### M1 — Local Vault Core (T013–T024)

- SQLite schema and migration runner for credentials, projects, deployments,
  usages, issuers, settings, audit log, and incidents.
- `VaultStorage` trait with a mock implementation and contract tests for
  storage backends.
- Argon2id + HKDF key derivation and an OS Keyring wrapper for vault keys.
- `AgeVaultStorage` — `age` crate (X25519 + ChaCha20-Poly1305) backed
  encrypted storage for credential secrets.
- Domain models and SQLite repositories for credentials, projects, deployments,
  usages, and issuers.
- Tauri command bindings for vault unlock and credential CRUD.
- Lock Screen and Create Vault dialog for first-run and re-lock flows.
- Clipboard auto-expiry after 30 seconds with a cancel token.

#### M2 — Inventory, Drop-and-Scan, Onboarding (T025–T040)

- Inventory list view with filter bar across issuer, project, environment, and
  search query.
- Issuer preset library seeded with 10 common providers (OpenAI, Anthropic,
  GitHub, AWS, Stripe, etc.) plus `issuer_list` / `issuer_get` commands.
- Credential register dialog and Credential detail Drawer with one-click
  clipboard copy.
- Cmd+K Command Palette for global navigation and credential search.
- Settings page with `settings_get` / `settings_set` commands and an idle
  auto-lock timer.
- Drop-zone onboarding with `/onboarding/scan` route, a `.env` / config file
  scanner with entropy-based detection, and `env_scan_folder` Tauri command.
- Drop-and-scan review UI with project/usage commands and a 3-step Welcome
  onboarding flow.
- Project CRUD page with linked-credential view, in-page Deployment CRUD,
  and Usage linking UI to manually wire credentials to projects.
- Credential security score with 3-tier visualization on the Inventory and
  Detail views.

#### M3 — Dependency Graph and Blast Radius (T041–T048)

- PetGraph-based dependency engine and BFS blast-radius engine for
  Issuer to Credential to Usage to Project to Deployment to URL paths.
- `graph_fetch` and `blast_radius_for_credential` Tauri commands.
- React Flow + dagre `/graph` page with four custom node types
  (Issuer, Credential, Project, Deployment) and 3-hop blast-radius
  highlighting on credential click.
- Mobile-friendly graph list view that surfaces the impact tree for a
  selected credential.
- Persistent node drag positions with a Reset layout button.

#### M4 — Incident Feed (T049–T058)

- NVD CVE API 2.0 client, GitHub Security Advisory client, SaaS status RSS
  client, and HIBP v3 client.
- Incident matching engine that links published advisories and breaches to
  credentials in the local vault.
- Background feed scheduler with configurable intervals.
- `incident_*` Tauri commands.
- Incidents page UI, an Incidents section on the Credential Detail page, and
  an NVD API key configuration UI that stores the key in the age vault and
  reconfigures the scheduler at runtime.

#### M5 — GitHub Connector and RAILGUARD (T059, T060, T065–T068)

- `Connector` trait definition and a GitHub App skeleton with a registration
  runbook.
- RAILGUARD template library covering four AI editor rule formats
  (`.cursorrules`, `CLAUDE.md`, GitHub Copilot instructions, and a generic
  `AI_RULES.md`).
- `railguard_preview` and `railguard_apply` two-step commands.
- `/railguard` page with an onboarding CTA, plus a conditional RAILGUARD
  suggestion in the Detected Keys Review step.

#### M6 — Audit Log (T069–T074)

- Hash-chained audit log with ed25519 signatures and a per-device identity
  service that stores its keypair in the age vault.
- Audit hooks injected into every mutating command.
- `audit_list` and `audit_verify_chain` commands.
- `/audit` timeline UI with a chain-verification banner and an Audit section
  on the Credential Detail page.

#### M7 — Kill Switch (T075–T078)

- Kill Switch backend with token-based two-step revocation.
- Two-step confirmation Dialog in the UI.
- Revoked-state visualization and a Hide revoked filter on the Inventory
  list.
- Bulk Revoke at the Issuer level for fast incident response.

### Changed

- Vault encryption replaced Stronghold with the `age` crate during M1
  scaffolding (decision recorded before any vault data was persisted).
- `incident_list` return shape extended to carry matched credentials and
  severity metadata for the Incidents UI.
- `generate_context!` invocation moved to the root crate so Tauri plugin
  ACLs resolve correctly.

### Fixed

- Workspace `[package]` table restored at the root `Cargo.toml` and the bin
  shim reconfigured after the workspace split.
- Test typecheck error in `GraphPage` tests resolved by aligning `vi.fn`
  generic signatures.
- Duplicate incident inserts prevented with `UNIQUE (source, source_id)` plus
  `INSERT OR IGNORE` on the incident store.
- Application shutdown hook moved to `RunEvent::Exit` so the feed scheduler
  finishes its in-flight work cleanly.
- Feed scheduler `spawn` moved inside the tokio runtime context to avoid a
  panic at startup.

### Security

- Local vault encrypted on-device with the `age` crate (X25519 +
  ChaCha20-Poly1305); plaintext secrets never leave the device.
- Vault keys derived with Argon2id + HKDF and stored in the OS keyring.
- Audit log entries are hash-chained and signed with a per-device ed25519
  keypair, with a chain-verification UI surfaced to the user.
- Kill Switch revocations require a two-step token confirmation to prevent
  single-click destructive actions.
- Clipboard contents copied from the vault auto-expire after 30 seconds.

### Known Limitations / Deferred

- **Sync relay not deployed.** Cloudflare Workers relay (T061–T064) is
  deferred. Multi-device sync (M9), authentication (M8), and payments (M10)
  depend on the relay and are not part of this release.
- **Mobile not included.** iOS and Android packaging is planned for M11.
- **Web read-only viewer not included.** Planned for M12.
- **Auto-updater signing not configured.** Code-signing and update-server
  infrastructure are planned for M13; this release is unsigned and must be
  installed manually.

[Unreleased]: https://github.com/api-vault/api-vault/commits/main
