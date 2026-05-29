# Changelog

All notable changes to Secretbank will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Continuing development beyond v0.1.0-pre18. Upcoming work: M24 Phase 3-B (secure_note), Phase 3-C (passkey), browser-extension store submission, mobile.

## [0.1.0-pre18] - 2026-05-15

dogfooding 라운드 — 폴더 드래그앤드롭 흐름의 4건 root cause 일괄 수정.

### Fixed

- **(A) `.gitignore` 무시** — env_scanner 가 ignore 룰을 존중하던 탓에 실제
  사용 중인 `.env` (거의 항상 gitignored) 가 스캔에서 누락되던 문제. ignore
  레이어 비활성 + `node_modules` / `.git` / `target` / `dist` / `.next` 등
  18개 노이즈 디렉토리는 `filter_entry` 로 prune.
- **(B) Issuer 미인식 entry import 허용** — 체크박스가 `!dk.issuer_slug` 로
  강제 disabled 되어 entropy-only 매칭 항목을 가져올 수 없던 문제. backend
  가 fallback issuer (DB 첫 항목) 로 NOT NULL 제약 만족.
- **(C) Empty state 탈출구 추가** — 결과 0건 화면에 텍스트만 있고 navigate
  버튼이 없어 사용자가 앱을 강제 종료해야 했던 문제. "홈으로" / "다른 폴더
  스캔" 두 버튼 추가 (4개 locale i18n).
- **(D) 평문 값 vault 자동 저장** — 핵심 missing feature. 기존엔 frontend 가
  `value: "scanned:unknown"` placeholder 만 저장해서 사용자가 한 건씩 수동
  rotate 해야 했음. CSV import 의 prepare/commit 패턴 차용.

### Added

- `DetectedKeyWithValue` (`secretbank-connectors`) — `DetectedKey` + 평문
  `SecretBox<String>` 페어. drop 시 zeroize (secrecy crate).
- `EnvScanSessionStore` (`secretbank-app/import`) — 5분 TTL, one-shot take,
  random 16-byte hex session ID. `ImportSessionStore` 와 같은 패턴.
- `env_scan_prepare` Tauri command — 스캔 → 세션에 평문 보관 → preview 반환
  (`{ sessionId, entries, expiresAtUnixMs, scannedPath }`).
- `env_scan_commit` Tauri command — `session_id + selectedIndices +
projectName` → vault `put_secret` + credential + project + usage 일괄 저장
  (vault write lock 1회만 획득).

### Changed

- `secretbank-connectors::env_scanner::scan_path` 는 thin wrapper —
  내부적으로 `scan_path_with_values` 호출 후 평문 strip.
- 옛 `env_scan_folder` Tauri command 제거 — frontend 가 새 prepare/commit
  쌍 사용. wire protocol breaking change.

## [0.1.0-pre17] - 2026-05-13

### Fixed

- **OAuth flow 전체 재작성** — custom URI scheme 모두 deprecated 후
  loopback HTTP server (RFC 8252) 로 전환. pre13~pre16 시도 (`Secretbank://`,
  `app.secretbank://`, `com.googleusercontent.apps...://`) 모두 Google
  공식 "Custom URI schemes are no longer supported due to the risk of app
  impersonation" 정책에 reject. 정답은 `http://127.0.0.1:<port>` loopback.

### Changed

- `tauri-plugin-oauth` 2.x 추가. `auth_oauth_start` Tauri command 의
  `redirect_uri` 인자 제거 — backend 가 동적 port 의 loopback HTTP server
  띄움 + callback 받아 `oauth-callback` Tauri event (payload `{provider,
url}`) 로 emit.
- `useDeepLinkCallback` (옛 `deep-link` event listener + Vec<String> payload)
  → `oauth-callback` event + `{provider, url}` object payload. 옛 in-app
  deep-link (graph 등) 은 별도 listener 라 영향 없음.
- `parseOAuthCallbackUrl` 가 loopback URL (`http://127.0.0.1` / `http://localhost`)
  검증 + provider 는 event payload 의 별도 field 에서 받음.

### Notes (사용자 액션)

- GitHub OAuth App 의 Authorization callback URL 을
  `app.secretbank://auth/callback` → **`http://localhost`** 또는
  **`http://127.0.0.1`** 로 갱신 (GitHub 가 wildcard port 인식).
- Google Cloud Console: Desktop type OAuth client 그대로 사용 — loopback
  이 native default 라 redirect URI 등록 불필요.

## [0.1.0-pre16] - 2026-05-13

### Fixed

- **redirect_uri 의 `?provider=...` query string 제거**: pre15 의
  `com.googleusercontent.apps.<id>://oauth2redirect?provider=google` 가
  여전히 `400 invalid_request` reject. Google native app redirect URI
  검증은 정확한 형식 매칭 (RFC 6749 query 보존과 무관). query 제거 후
  `parseOAuthCallbackUrl` 가 scheme 으로만 provider 추론.

## [0.1.0-pre15] - 2026-05-12

### Fixed

- **Google OAuth `app.secretbank://` 도 `400 invalid_request` reject**:
  Google 의 reverse-DNS 검증이 2-segment scheme + `.app` TLD 통과 못 함.
  Google docs 권장의 **`com.googleusercontent.apps.<client_id>://oauth2redirect`**
  scheme (Google 자동 등록) 으로 교체.
- **`parseOAuthCallbackUrl` provider 추론**: redirect URI 에 `?provider=...`
  query 박음 (RFC 6749 §4.1.2 query 보존). callback 시 query 가 없으면
  scheme 으로 provider 추론 (fallback).
- Provider 별 redirect URI 분리:
  - Google: `com.googleusercontent.apps.<id>://oauth2redirect?provider=google`
  - GitHub: `app.secretbank://auth/callback?provider=github`

## [0.1.0-pre14] - 2026-05-12

### Fixed

- **Google OAuth `400 invalid_request`**: redirect URI scheme 을
  `Secretbank://auth/callback` → `app.secretbank://auth/callback` 으로 교체.
  Google 의 Desktop OAuth 정책 (2022+) 이 "reverse-DNS notation of a
  domain you control" 만 허용. `secretbank.app` 도메인의 reverse-DNS =
  `app.secretbank`.
- Tauri `tauri.conf.json` 의 `plugins.deep-link.desktop.schemes` 에
  `"app.secretbank"` 추가 (기존 `"secretbank"` 도 유지 — graph 등 in-app
  deep-link 호환).
- `use-deep-link-callback.ts` 의 `CALLBACK_PREFIXES` array 로 둘 다 매칭
  (in-flight 옛 release 호환).
- **OAuth callback 시 새 instance + vault 잠김** 이슈:
  `tauri-plugin-single-instance` (deep-link feature) 추가. OS 가 deep-link
  를 새 process 로 띄울 때 기존 unlock 된 instance 로 URL forward + window
  focus. 이전엔 callback 마다 새 process → vault 잠김 화면.

### Notes (사용자 액션)

- GitHub OAuth App settings 의 Authorization callback URL 을
  `app.secretbank://auth/callback` 으로 갱신 필요. (이전엔
  `Secretbank://auth/callback`.)

## [0.1.0-pre13] - 2026-05-11

### Fixed

- **OAuth login (Google + GitHub)**: `DEFAULT_RELAY_URL` now points to
  `https://relay.secretbank.app` instead of `https://secretbank.app`. The
  former routed to Cloudflare Pages (405 Method Not Allowed on POST), the
  latter routes to the Cloudflare Workers relay. Previously OAuth start
  threw `RelayError::Decode` and surfaced as `[object Object]` in the
  SignIn page.
- New site favicon + desktop app icon set rendered from the same
  VaultMechanism inline SVG (nav logo) — replaces the prior 1×1 transparent
  placeholder (favicon) and the centre-misaligned white-square icon set.

### Notes

- Desktop installer must be re-downloaded — `DEFAULT_RELAY_URL` is a
  compile-time constant.
- Relay-side change: `wrangler.toml` `routes` un-commented + custom domain
  `relay.secretbank.app` linked + `GOOGLE_OAUTH_CLIENT_SECRET`,
  `JWT_SIGNING_KEY`, `GITHUB_OAUTH_CLIENT_SECRET` injected via `wrangler
secret put`. Deploy workflow fix: `pnpm install --ignore-workspace`
  (ee/secretbank-relay is outside the root workspace).

## [0.1.0-pre12] - 2026-05-10

First release with the full Browser Extension chain (Chrome MV3 + Firefox MV2), the unified Bento credit-card kind, and the new lapis+gold brand identity.

### Added — Browser Extension (M24-E, 53/53 sub-tasks)

- **Autofill (Phase C)** — form-detector + fill-handler with Shadow-DOM-aware traversal, autocomplete priority + name/id regex fallback, subdomain-safe phishing defense, DOM Clickjacking 3-layer mitigation (closed shadow + MutationObserver + composedPath, the 2025 Marek Tóth disclosure).
- **Save dialog (Phase D)** — XHR/fetch hook + form submit listener, content↔ISOLATED postMessage with origin verification, SaveBanner Shadow DOM, save-handler routing for new/rotation, Tauri credential persistence.
- **Generator + brand (Phase E)** — inline password generator on save, recipe inheritance, Site Logo card on the popup, lapis+gold design tokens.
- **Differentiators (Phase G, 1Password cannot do these)** — inline dependency mini-graph (CredentialCard hover, SVG fan-out), supply-chain banner (NVD/GHSA breach in-page warnings), blast-radius preview on save, MCP context push (opt-in, 5-min cooldown), RAILGUARD AI-editor sidebar warning (8 hosts).
- **Cross-browser (Phase F)** — Chrome / Firefox / Edge / Safari placeholder. Playwright Chromium E2E + web-ext build smoke. Store submission packages (Chrome $5, Edge free, Firefox AMO free).
- **Native Messaging Host (Phase B)** — pairing dialog with HMAC-SHA256 session token, configurable TTL (5 options), audit-log integration.

### Added — Unified Bento Inventory (M24)

- **Phase 3-A: Credit-card kind** — CredentialKind::CreditCard + 0012 migration, BIN detection prefix-only, react-number-format pattern (4-4-4-4 / Amex 4-6-5), 3D flip via `motion/react` with `useReducedMotion`, billing-address optional, no PIN by Zod refine, 30-second auto-clear on reveal with audit log.
- **Phase 2-2B: Watchtower** — bulk security score with health badges per credential, breach feed integration.

### Added — brand identity

- **final_logo** lapis + gold metallic vault shield + key + lock, applied across Tauri icons (Windows / macOS / Linux full set + iOS + Android), browser extension `public/icon/{16,32,48,128}.png`, `site/og-image`, favicons (5 sizes), `index.html` / `guide.html` meta tags.
- Brand identity formalized in `docs/project-decisions.md`.

### Fixed — security

- `postcss < 8.5.10` (3 moderate Dependabot alerts: GHSA-566m-qj78-rww5, GHSA-7fh5-64p2-3v2j, GHSA-qx2v-qp2m-jg93). Replaced unmaintained `postcss-rem-to-pixel@4.1.2` (transitive postcss 5.2.18) with `postcss-rem-to-responsive-pixel@^7.0.4` (postcss 8 peer, actively maintained).
- `hono` 4.12.15 → 4.12.18 (2 moderate alerts).

### Fixed — CI

- Rust migration test pinned against new `0015_audit_seq_reindex` migration.
- WXT `postinstall: wxt prepare` runs in CI to produce `defineContentScript` / auto-imports types.
- Extension E2E worker teardown 60s race + Playwright Chromium MV3 launch budget.
- 5 areas patched in one round: Rust scope / ESLint / TS / vitest unhandled / Playwright launch.

## [0.1.0-pre8] - 2026-05-03

First valid prerelease — every install / update channel exercised end-to-end.

### Added — launch infrastructure

- **Public GitHub repository** (`phoodul/secretbank`) — open-sourced under AGPL-3.0
  with `/ee/` carved out as Enterprise License. Anonymous artifact downloads and
  Tauri auto-updater verified.
- **First valid prerelease** v0.1.0-pre8 — 12 GitHub release assets:
  - macOS: `*_universal.dmg` + `*.app.tar.gz` + `.app.tar.gz.sig`
  - Windows: `*_x64-setup.exe` + `*.exe.sig` + `*_x64_en-US.msi` + `*.msi.sig`
  - Linux: `*_amd64.deb` + `*_amd64.AppImage` + `*.AppImage.sig` + `*-1.x86_64.rpm`
  - `latest.json` — Tauri auto-updater manifest with darwin-x86_64 / darwin-aarch64 /
    windows-x86_64 / linux-x86_64 entries
- **`secretbank.app` landing page live** — Cloudflare Pages with custom-domain SSL.
  New design: bento-grid + glassmorphism + light/dark toggle + animated gradient
  mesh background. Logo is an SVG recreation of the desktop app's VaultMechanism
  unlock scene (hexagonal frame + brass reactor disc + cardinal reticle + rotating
  sweep arc + halo bloom + reactor core pulse).
- **`secretbank-relay.phoodul.workers.dev` live** — Cloudflare Workers relay
  deployed; secrets registered (`JWT_SIGNING_KEY`, `GITHUB_OAUTH_CLIENT_SECRET`,
  `GOOGLE_OAUTH_CLIENT_SECRET`); GitHub & Google OAuth client IDs in
  `wrangler.toml`. The `/ee/` enterprise license boundary is intact.
- **Issue templates + Discussions** — `.github/ISSUE_TEMPLATE/` with bug-report
  and feature-request forms plus a `config.yml` redirecting Q&A and Ideas to
  Discussions, security to `SECURITY.md`. Six default Discussions categories
  (Announcements / General / Ideas / Polls / Q&A / Show and tell) created.
- **GitHub Actions release pipeline** — `release.yml` builds all 3 platforms,
  uploads bundles + `.sig` files, then synthesizes `latest.json` for the auto
  updater. CI workflow (`ci.yml`) covers Rust fmt/clippy/test, frontend
  typecheck/lint/format/vitest, E2E smoke (Playwright), and EE Relay
  typecheck/test. Node 22 LTS across all workflows.
- **Demo capture infrastructure** — `scripts/capture-demo.ts` + `e2e/demo.spec.ts`
  - `e2e/playwright.demo.config.ts`. Records three webm scenes (lock-screen /
    charter-issuance / recovery-flow) for marketing assets. `pnpm capture:demo`.

### Changed — pricing & roadmap

- **Pricing reset to free beta** — Pro $2/month / $15/year is **not** introduced
  at launch. All features (including multi-device E2EE sync, auto-revoke,
  auto-rotation) remain free until four conditions are met: (1) author
  dogfooding ≥ 1 week, (2) legal review of terms / privacy / payment policies,
  (3) **M24 general-password vault feature ships**, (4) feedback from the first
  100–500 users. See `docs/project-decisions.md` (2026-05-03 entry) and
  `docs/architecture.md` §9.1.
- **M24 — General Password Vault** added as a new milestone (T-24-A through
  T-24-E). Extends `credential.kind` to `"api_key" | "password"`; reuses the
  same vault, charter recovery, audit log, and dependency graph. Browser
  autofill is deferred to M24 v2.

### Fixed — prerelease iteration (pre1 → pre8, 7 fixes)

- **pre1 → pre2** — macOS build failed because `tauri-action` passed empty
  `APPLE_*` env vars (codesign with empty identity). Replaced with direct
  `pnpm tauri build` invocation; signing only the auto-updater key. (`e848a75`)
- **pre2 → pre3** — `shopt -s globstar` unsupported on macOS bash 3.2. Replaced
  with `nullglob` only. (`eb44be1`)
- **pre3 → pre4** — `jq | head` SIGPIPE on pipe close fired `pipefail` and
  failed the manifest job. Removed `pipefail` for that step; rewrote `pick()`
  to use `[...][0] // empty` inside jq. (`124435f`)
- **pre4 → pre5** — `gh` CLI on a fresh runner without `actions/checkout` could
  not detect the repo. Injected `GH_REPO` env var. (`cd7911a`)
- **pre5 → pre6** — `.sig` files were not produced because Tauri v2 needs
  `bundle.createUpdaterArtifacts: true` opt-in. Set it; rewrote the manifest
  picker to use `endswith()`. (`699a0e3`)
- **pre6 → pre7** — Windows `.nsis.zip` never appeared because Tauri v2 signs
  the NSIS `.exe` directly (no zip wrapper). Added a diagnostic step to list
  bundle output and broadened the upload glob. (`6fa1722`)
- **pre7 → pre8** — `latest.json` had no `windows-x86_64` entry because the
  manifest picker still searched for `.nsis.zip`. Switched the suffix to
  `-setup.exe` / `-setup.exe.sig`. (`abc0baf`)

### Fixed — CI green restoration

- **Rust** — workspace cargo fmt drift, missing Linux native deps
  (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
  etc.) for clippy/test, and `migration_test` expected-table list updated for
  M20 supply-chain tables.
- **Frontend** — prettier wrote 164 files; ESLint config now ignores
  `vscode-extension/out/`, recognises `^_` as intentionally unused, downgrades
  `react-hooks/set-state-in-effect` and `react-hooks/refs` to warnings,
  introduces a Node-globals override for `scripts/` and `e2e/`, and a
  vscode-extension override.
- **EE Relay** — `pair.test.ts` response type narrowed to include
  `joiner_pub_b64`.
- **E2E smoke** — strict-mode locator collision fixed by switching to
  `getByRole("main")`.
- **Shamir parser** — flaky `parse_tolerates_alternate_formats` finally
  reproducible: the EFF wordlist contains four hyphen words (`drop-down`,
  `t-shirt`, `yo-yo`, `felt-tip`) which the input cleaner was splitting on
  `-`. Cleaner now preserves intra-word `-` when whitespace is present and
  filters standalone `-` tokens after split. Same fix in
  `charter::parse`. (`e4e7bbb`)
- **Node 20 deprecation** — bumped all `actions/setup-node@v4` to Node 22 LTS.

### Security

- Tauri updater keypair generated locally, public key embedded in
  `tauri.conf.json`, private key + password registered as GitHub Secrets.
- Cloudflare API token uses the `Edit Cloudflare Workers` template plus
  explicit `D1: Edit` permission (D1 was missing from the template).
- All wrangler `secret put` invocations stay client-side; no secret has been
  committed to the repo.

### Added

#### M23 — Vault Charter recovery (출시 블로커 해소, milestone close)

- **`secretbank-charter` crate** — EFF Diceware large wordlist (7776 words,
  public domain) embedded; 6-word + 4-digit verifier codec; Shamir Secret
  Sharing 2-of-3 (sharks crate, GF(2⁸) byte-wise); XChaCha20-Poly1305
  envelope wrapping a 32B `enc_key` with Argon2id-derived charter key.
  31 unit tests covering codec round-trip, single-word typo detection,
  share split + 2-of-3 reconstruction, wrong-charter and tampered-envelope
  rejection, secret zeroize on drop.
- **Vault file format v2** — `CHARTER_FLAG (1B) + LEN (2B) + envelope (≤1024B)`
  appended to the v1 header. Legacy v1 files read transparently with
  `charter_envelope = None`. 7 file-level regressions.
- **`AgeVaultStorage::initialize_with_charter`** — vault creation issues a
  charter (Single / Shamir2of3 / None) atomic with the empty record map.
  Issued `Charter` / `ShamirShare` is shown to the UI once and never
  persisted. 7 integration tests.
- **`AgeVaultStorage::recover_with_charter`** — charter unwraps the envelope
  back to `enc_key`, decrypts the existing records, then rewraps everything
  under a fresh salt + new passphrase. Old passphrase and old charter are
  both invalidated; an optional new charter mode is offered. 7 integration
  tests including Shamir-combine recovery and post-recovery rotation.
- **3 Tauri commands** — `vault_init_with_charter`, `vault_recovery_unlock`,
  `vault_has_charter`. DTOs (`CharterIssuanceDto` with snake_case `kind`
  tag, `CharterRecoveryInput` for single phrase or Shamir share list).
  Audit hook records `vault.charter.issued` and `vault.charter.recovered`
  with cooldown metadata. 9 unit tests.
- **Charter UI (Lapis tone, printable)** — `CharterDisplay` with brass-and-
  lapis SVG seal artwork, monospace word grid, 4-digit verifier line,
  per-share index for Shamir mode. `@media print` strips the warning banner
  and overlay; backgrounds become white-on-black for paper. Two-step "I've
  saved it" confirmation overlay prevents accidental dismissal.
- **`RecoveryDialog`** — `Forgot your passphrase?` link on the lock screen
  (only when `vault_has_charter` is true). Mode radios (single / Shamir),
  3 share textareas with optional 3rd, new passphrase + confirm with zxcvbn
  meter, new-charter-mode radios, error mapping for `charter_absent` /
  `charter_invalid` / `charter_parse_error`.
- **Charter cooldown sidecar** — `vault.age.cooldown.json` plaintext
  metadata file (enabled flag + cooldown_until_unix_ms +
  last_recovery_unix_ms). Sits outside the encrypted vault so unlock can
  consult it without first decrypting. `apply_recovery_event` is invoked
  on every successful recovery; `vault_unlock` rejects with
  `CooldownActive { seconds_remaining }` while the window is open.
  Defense-in-depth against "stolen laptop + stolen charter" — gives the
  legitimate owner a 7-day window to wipe the vault file remotely.
- **Settings → Charter cooldown toggle** — `CharterCooldownSection` calls
  `charter_cooldown_status` on mount, exposes a switch and a "Clear
  cooldown" button when active. Vault must be unlocked to change the
  toggle (self-attestation).
- **i18n** — 36 charter UI keys in en + ko (vault.charter._ + vault.recovery._),
  9 cooldown keys.
- **Unlock animation deceleration fix** (carry-over from Night mode 7) —
  `VaultMechanism` ringTransition switched from spring(200/22) to
  cubic-bezier ease-out `[0.16, 1, 0.3, 1]` with 1.4s duration. Rings
  now visibly slow down as they snap into alignment, matching the
  Magnific tecnologia ocular reference aesthetic.
- **README + landing page + USER_GUIDE (en/ko) + TERMS** — updated
  references from "24-word recovery code" placeholder to actual Vault
  Charter mechanics.

#### M22 — JetBrains plugin (v5, milestone close)

- **Blast radius visualization** — right-click a credential → "Show
  blast radius" colours the downstream graph by BFS depth (primary
  red, secondary orange, tertiary yellow), glows the source node, and
  dims everything outside the blast set. A bottom banner reports the
  total affected count. This brings the desktop app's headline
  "what breaks if I revoke?" feature into the IDE.
- New `Secretbank blast-radius <id>` CLI subcommand wraps
  `secretbank-core::blast_radius` and emits the three buckets as JSON.
- **Context menu** (`JBPopupMenu`) on right-click. Menu items vary by
  node kind: credential gets _Show blast radius_ + _Reveal_, others
  get the relevant _Open URL/docs/repo_. All kinds get _Focus_ and
  _Copy ID_.
- **Keyboard shortcuts** in the graph: `Ctrl/Cmd+F` focuses the
  search box, `Esc` clears all highlights and filters, `Ctrl/Cmd+0`
  fits all nodes to view.
- **Clear highlight** toolbar button alongside Refresh / Center.

#### M22 — JetBrains plugin (v4)

- **Interactive Graph** — double-clicking a node now triggers the right
  action by node kind:
  - Credential → passphrase prompt → reveal value to clipboard
    (30s auto-clear).
  - Issuer → open the issuer's docs URL.
  - Project → open the project's repo URL.
  - Deployment → open the deployment URL.
- JS ↔ Kotlin bridge built on `JBCefJSQuery`. The HTML page calls
  `__SecretbankSend("verb:id")`; Kotlin parses the message, looks up the
  node from a cached index, and dispatches the action.
- Filter box (top-right) dims non-matching nodes and edges. **Center**
  button computes the bounding box of all nodes and fits them to the
  viewport.
- `Secretbank graph` CLI extended to emit per-node metadata
  (`env`, `status`, `repo_url`, `docs_url`, `url`, `platform`,
  `issuer_id`, `project_id`) so the JetBrains action layer can route
  by kind without re-hitting SQLite.

#### M22 — JetBrains plugin (v3)

- **Graph tab** in the Tool Window: dependency graph rendered inside JCEF
  via a self-contained force-directed layout. Pan (drag), zoom (wheel),
  and click-to-highlight neighbors. No external CDN — bundled HTML+JS
  ships with the plugin, works offline. Falls back to a notice on IDE
  builds without JCEF.
- New `Secretbank graph` CLI subcommand outputs the dependency graph as
  JSON (nodes: Issuer / Credential / Project / Deployment, edges:
  issues / used_by / deployed_as). Reads SQLite directly — no vault
  unlock required.
- `SecretbankService.fetchGraph()` parses the CLI's output into typed
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
- `Tools → Secretbank` menu group with three actions: list credentials, reveal
  credential (passphrase prompt → clipboard, auto-clear in 30s), scan
  supply-chain risk.
- Status-bar widget with the Secretbank shield icon.
- `LocalInspection` for `package.json` and `Cargo.toml` that flags lines whose
  package matches a cached supply-chain advisory as WARNING.
- `SecretbankService` wraps the `Secretbank` CLI process and caches scan results
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

- Language Model tools (VS Code 1.96+): `Secretbank_list_credentials` and
  `Secretbank_scan_supply_chain` so Copilot Chat / Claude / Cursor can invoke
  the vault without per-host wiring.
- `package.json` hover provider — last scan's advisory tooltip on dependency
  lines.

#### M21 — Editor plugins (v1)

- VS Code extension with palette commands (list, reveal, scan) and Problems
  panel diagnostics scoped to source `secretbank`.
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

- New `secretbank-supply` crate: `manifest`, `ecosystem`, `advisory`,
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

- `Secretbank` CLI with `list`, `reveal`, `run`, and (added in M22 follow-up)
  `scan supply-chain` subcommands. Mirrors the desktop app's vault
  location so a single vault is shared.
- `Secretbank mcp serve` starts a local Model Context Protocol server over
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

[Unreleased]: https://github.com/phoodul/secretbank/compare/v0.1.0-pre8...HEAD
[0.1.0-pre8]: https://github.com/phoodul/secretbank/releases/tag/v0.1.0-pre8
