# Changelog

All notable changes to API Vault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release of API Vault — a desktop secrets manager that maps how API
keys relate to your projects, deployments, and URLs, so you always know the blast
radius before you rotate or revoke a key.

### Added

#### M22 — JetBrains plugin (v3)

- **Graph tab** in the Tool Window: dependency graph rendered inside JCEF
  via a self-contained force-directed layout. Pan (drag), zoom (wheel),
  and click-to-highlight neighbors. No external CDN — bundled HTML+JS
  ships with the plugin, works offline. Falls back to a notice on IDE
  builds without JCEF.
- New `apivault graph` CLI subcommand outputs the dependency graph as
  JSON (nodes: Issuer / Credential / Project / Deployment, edges:
  issues / used_by / deployed_as). Reads SQLite directly — no vault
  unlock required.
- `ApiVaultService.fetchGraph()` parses the CLI's output into typed
  Kotlin records.

#### M22 — JetBrains plugin (v2)

- Tool Window (right side, secondary): Credentials / Supply chain /
  Settings tabs.
- `CredentialsPanel` — JBList with text filter, refresh, and reveal
  (passphrase prompt → clipboard, auto-clear in 30s).
- `SupplyChainPanel` — JBTable sorted by severity descending.
  Severity-coloured cell renderer. Double-click a row to open the
  matching manifest in the editor.
- `SettingsPanel` — per-project CLI path and "scan on project open"
  toggle.
- `ProjectStartup` (`postStartupActivity`) auto-runs a supply-chain
  scan when a project opens if the toggle is on, caching the result
  for the Supply chain tab.
- Inspection line parser extended to `requirements.txt` (`==`, `>=`,
  `<=`, `~=`, `!=`) and `go.mod` (single-line `require` and block-line
  `\tmodule v1.2.3`). Comment lines (`#`, `//`) excluded.

#### M22 — JetBrains plugin (v1)

- Gradle Kotlin DSL plugin module at `jetbrains-plugin/` targeting IntelliJ
  Platform 2.1.0. Compatible with IDEA / WebStorm / GoLand / PyCharm / Rider /
  CLion via `com.intellij.modules.platform`.
- `Tools → API Vault` menu group with three actions: list credentials, reveal
  credential (passphrase prompt → clipboard, auto-clear in 30s), scan
  supply-chain risk.
- Status-bar widget with the API Vault shield icon.
- `LocalInspection` for `package.json` and `Cargo.toml` that flags lines whose
  package matches a cached supply-chain advisory as WARNING.
- `ApiVaultService` wraps the `apivault` CLI process and caches scan results
  for inspection use.
- JUnit 5 tests for the line-based manifest dependency parser.

#### M21 — Editor plugins (v3)

- Cargo.toml hover provider — same advisory tooltip behavior as the existing
  package.json hover.
- `ManifestCodeLensProvider` — risky dependency lines in package.json /
  Cargo.toml get an inline "🔑 N advisor(ies)" code lens that opens the
  Problems panel.
- `scanWorkspace` now scans Cargo.toml as well as package.json.

#### M21 — Editor plugins (v2)

- Language Model tools (VS Code 1.96+): `apivault_list_credentials` and
  `apivault_scan_supply_chain` so Copilot Chat / Claude / Cursor can invoke
  the vault without per-host wiring.
- `package.json` hover provider — last scan's advisory tooltip on dependency
  lines.

#### M21 — Editor plugins (v1)

- VS Code extension with palette commands (list, reveal, scan) and Problems
  panel diagnostics scoped to source `api-vault`.
- Status bar item linking to the credential list.

#### M20 — Supply chain risk graph (v2)

- Lockfile parsers: `package-lock.json` (npm v3+ "packages" map and v6
  "dependencies" tree), `pnpm-lock.yaml` (v6 keys with peer-meta strip),
  `Cargo.lock`.
- `range_eval` module — parses OSV affected-range strings (e.g.
  `>=0 <1.0.4`) and evaluates a dep's resolved version against them. Strict
  semver for npm/Cargo, lexical fallback for other ecosystems. Handles
  partial versions, pre-release tags, and open upper bounds (`<*`).
- `match_advisories` now filters out matches whose version falls outside
  the advisory's affected range. `MatchResult.in_range` exposes the result
  for callers that want to display a warning anyway.
- Tauri command `supply_scan_project` reads the project's lockfiles before
  the OSV query, so range strings are replaced with concrete versions.

#### M20 — Supply chain risk graph (v1)

- New `api-vault-supply` crate: `manifest`, `ecosystem`, `advisory`,
  `matcher` modules.
- `OsvClient` queries `api.osv.dev` per (ecosystem, name, version) tuple
  and classifies advisories into `secret_leak` / `crypto_weak` /
  `supply_chain` / `other` from text signals.
- SQLite tables `package`, `package_advisory`, `package_usage` with their
  upsert-and-list repos.
- `supply_scan_project` Tauri command performs the full pipeline; result
  is auto-rendered into the dependency graph.
- `check_supply_chain_risk` MCP tool exposes the same to AI assistants.

#### M19 stub

- Placeholder for Team / org / shared-vault feature set; entered after
  M22 completes and beta feedback comes in.

#### M18 — CLI + MCP server

- `apivault` CLI with `list`, `reveal`, `run`, and (added in M22 follow-up)
  `scan supply-chain` subcommands. Mirrors the desktop app's vault
  location so a single vault is shared.
- `apivault mcp serve` starts a local Model Context Protocol server over
  stdio. Five tools exposed: `list_credentials`, `reveal_credential`,
  `check_railguard_status`, `suggest_railguard_template`,
  `check_supply_chain_risk`.

#### M9 — Multi-device E2EE sync

- Yjs + custom transport CRDT on top of a Cloudflare Workers relay.
- X25519 ECDH device pairing — joiner enters a 6-digit PIN from the host
  and the master passphrase / key material is transferred over an
  authenticated channel without re-prompting.
- AAD bindings (`user:<userId>:cred:<credId>`) defend against swap
  attacks at the relay layer.

#### M8 — Auth (Passkey + OAuth)

- Argon2id + HKDF chain for derived sub-keys (`crdt-root`, `value-root`,
  `pair-channel`).
- Sign-in UI, refresh-token rotation, 9 client commands.

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
