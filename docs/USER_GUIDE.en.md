# API Vault — User Guide (English)

> The dependency-graph-aware secrets manager. Stores keys, but also tells you
> **who uses them, where, and what breaks if you revoke them.**

This guide covers the desktop app, CLI, MCP server, and VS Code extension —
ordered by how often you'll actually use each.

---

## Table of contents

1. [Install and first run](#1-install-and-first-run)
2. [Desktop — credential management](#2-desktop--credential-management)
3. [Desktop — dependency graph / blast radius](#3-desktop--dependency-graph--blast-radius)
4. [Desktop — incident feed (NVD/GHSA)](#4-desktop--incident-feed-nvdghsa)
5. [Desktop — Kill Switch (emergency revoke)](#5-desktop--kill-switch-emergency-revoke)
6. [Desktop — RAILGUARD (AI editor protection)](#6-desktop--railguard-ai-editor-protection)
7. [Desktop — supply chain scan](#7-desktop--supply-chain-scan)
8. [Desktop — multi-device sync](#8-desktop--multi-device-sync)
9. [CLI — `apivault`](#9-cli--apivault)
10. [MCP server — Claude / Cursor / Copilot Chat](#10-mcp-server--claude--cursor--copilot-chat)
11. [VS Code extension](#11-vs-code-extension)
12. [Backup and recovery](#12-backup-and-recovery)
13. [FAQ](#13-faq)

---

## 1. Install and first run

### 1.1 Requirements

- Windows 10+ (x64), macOS 12+ (Apple Silicon or Intel), Linux (Ubuntu 22+ /
  glibc 2.35+).
- 100 MB disk, 200 MB RAM.
- Internet is **optional**. Only sync, incident feed, and supply-chain scan
  need network. The local vault works fully offline.

### 1.2 Install

| Platform | How                                                          |
| :------- | :----------------------------------------------------------- |
| Windows  | `api-vault_x64-setup.exe` or `winget install api-vault`      |
| macOS    | `api-vault_universal.dmg` or `brew install --cask api-vault` |
| Linux    | `.deb` / `.AppImage` / `.rpm` or `snap install api-vault`    |

Builds: https://github.com/phoodul/api-vault/releases

### 1.3 First run — set the master passphrase

1. On first launch you see "**Create vault**".
2. Enter a master passphrase (16+ chars recommended — 4–6 random words).
3. Choose a Vault Charter mode (recommended: **Single charter**). Click
   **Create vault** and a printable charter is shown — 6 Diceware words
   plus a 4-digit verifier. **Print or write it on paper, store offline.**
   Do not paste it into a clipboard manager. The charter is shown only once.
4. Confirm "I've saved it" and an empty vault is created. (See §12.3 for
   Shamir 2-of-3 mode and recovery instructions.)

> ⚠️ If you lose **both** the master passphrase and the Vault Charter, the
> data is **unrecoverable**. We can't help — that's the cost of
> Zero-Knowledge.

### 1.4 Lock and unlock

- Auto-locks after 5 minutes idle (configurable).
- Right-click tray/menu-bar icon → **Lock vault** for an immediate lock.
- Enter passphrase to unlock. 1-minute cooldown after 5 failed attempts.

---

## 2. Desktop — credential management

### 2.1 Create a credential

1. Sidebar **Credentials** → **+ New**.
2. Required:
   - **Issuer** — `OpenAI`, `Stripe`, `AWS`, etc. Quick-pick autocomplete.
   - **Name** — human-friendly, e.g. `prod-billing-key`.
   - **Value** — the key/token. Masked on input.
3. Optional:
   - **Environment** — `dev` / `staging` / `prod` label.
   - **Expires at** — auto-notify 7 days before.
   - **Scopes / Notes** — free text.
4. **Save** — stored encrypted in the local SQLite. Plaintext is zeroized
   from RAM immediately.

### 2.2 View / copy

- Click an item → metadata in the side panel.
- **Reveal** — re-enters passphrase, shows plaintext for 30 seconds.
- **Copy** — to clipboard, auto-cleared after 30s (configurable).
- **History** — past rotations (up to 5 generations retained).

### 2.3 Search and filter

- Cmd/Ctrl + K → global command palette.
  - Combine filters: `> issuer:openai env:prod`.
- Top-left search box does fuzzy match.

### 2.4 Rotate

1. ⋮ menu on a credential → **Rotate**.
2. Paste the new value — the old one moves to history.
3. Toggle **Verify with provider** (Pro) to ping the issuer's healthcheck.

---

## 3. Desktop — dependency graph / blast radius

### 3.1 The graph

Sidebar **Graph** → full-screen.

```
Issuer ─▶ Credential ─▶ Usage (code site) ─▶ Project ─▶ Deployment ─▶ URL
```

- Double-click a node for details.
- Type a name in the top search to focus + highlight neighbors.
- Color is a risk score (green = safe, red = high) — **a signal, not an
  absolute**.

### 3.2 Register usage (where the key is used)

The graph is only useful if it knows where each key is consumed.

**Auto (recommended)** — drop-zone scanner:

1. Sidebar **Scan** → drag a project folder.
2. Detects `.env*`, `process.env.X`, `os.getenv("X")`, `Bun.env.X` via regex
   - AST.
3. Each finding is presented; pick the matching credential and **Link**.

**Manual** — credential detail → **Add usage** → file path + line number.

### 3.3 Blast radius simulation

1. Credential detail → **Blast Radius**.
2. Nodes that would break if you revoked appear in red — **preview only**.
3. Nothing happens until you click **Apply**.
4. If the impact looks correct, proceed with **Revoke**.

---

## 4. Desktop — incident feed (NVD/GHSA)

### 4.1 What it does

- Background polling of NVD, GHSA, and major issuer RSS feeds.
- Local-only matching against your credentials' `issuer` slugs.
- Server never sees which keys you have.

### 4.2 The view

Sidebar **Incidents**:

- **Affecting you** — incidents that match your vault.
- **All** — every polled incident.

Each card:

- Headline, publish date, source link.
- **Affected credentials** — your N credentials matching this incident.
- **Action** — `Rotate`, `Snooze`, `Mark resolved`.

### 4.3 Notifications

- Native OS toast on match (Tauri notification plugin).
- Quiet hours / weekend mode in settings.

---

## 5. Desktop — Kill Switch (emergency revoke)

### 5.1 When to use

- Lost laptop, leaked GitHub push, exposed colleague.
- Single key, entire issuer, or all `prod` credentials at once.

### 5.2 Steps

1. Credential detail → **Kill** (red button).
2. Confirmation dialog: blast-radius preview + passphrase re-prompt.
3. After kill, audit log records the event and a self-incident is added to
   the feed.

### 5.3 Pro — auto-revoke

For issuers that expose a `revoke` endpoint (Stripe, GitHub PAT, etc.), the
kill switch can call out and invalidate server-side too.

---

## 6. Desktop — RAILGUARD (AI editor protection)

Stops AI editors (Cursor, Copilot, Claude Code) from accidentally exfiltrating
your keys via training, logs, or external calls.

### 6.1 How it works

1. Analyze patterns in your vault → generate a regex ruleset.
2. Export the ruleset in `.cursorrules` / `CLAUDE.md` /
   `.github/copilot-instructions.md` formats.
3. Drop the file at the project root — the AI editor will block / mask key
   I/O.

### 6.2 Use

1. Sidebar **RAILGUARD** → **Generate**.
2. Pick target editors (multi-select OK).
3. Pick a project folder → ruleset files written.
4. **Verify** runs sample scenarios to confirm the editor actually applies
   the ruleset.

### 6.3 Auto-update

- Adding a new credential can auto-refresh the ruleset (setting).
- Updates show as a diff for your review before applying.

---

## 7. Desktop — supply chain scan

This is the hard differentiator vs. 1Password / Doppler / Infisical.

### 7.1 What it checks

Whether your project's npm / Cargo / PyPI dependencies have a **secret-leak
history** in the OSV.dev database. Lockfiles are read so version matching is
exact, not approximate.

### 7.2 Run a scan

1. **Scan** → **Add project** → pick the project root.
2. **Run scan**.
3. Result:
   - manifests found / dependencies seen / advisories matched.
   - Categories: secret-leak, supply-chain, crypto-weak.
   - Click an advisory to open the OSV / GHSA source.

### 7.3 Graph integration

Scan results are written into the graph automatically:

- `Project` → `Package` (color-coded by risk) → affected `Credential`.
- The cross-domain blast radius story: "this npm package has a known
  secret-leak history → this project depends on it → these credentials are
  at risk."

### 7.4 Supported manifests

| Ecosystem         | Manifest       | Lockfile (exact-version resolution)   |
| :---------------- | :------------- | :------------------------------------ |
| npm / pnpm / yarn | `package.json` | `package-lock.json`, `pnpm-lock.yaml` |
| Cargo (Rust)      | `Cargo.toml`   | `Cargo.lock`                          |

PyPI / GoMod / Maven: manifest only for now (lockfile parsing is planned).

---

## 8. Desktop — multi-device sync

Pro feature. Read and write the same vault from a second device.

### 8.1 Pair

**Device 1 (host)** — Settings → **Sync** → **Pair new device** → 6-digit PIN
shown (60-second TTL).

**Device 2 (joiner)**:

1. On a fresh install, pick **Pair with another device** on the first
   screen.
2. Enter the host's PIN.
3. An X25519 ECDH channel is established and the master passphrase / key
   material is transferred securely.
4. You don't re-enter the master passphrase.

### 8.2 Zero-knowledge guarantees

- Relay servers store ciphertext only. Plaintext, master keys, and even
  graph node names are encrypted client-side.
- AAD (additional authenticated data) binds each ciphertext to
  `user:<userId>:cred:<credId>` — protecting against swap attacks.

### 8.3 Conflict resolution

- Yjs CRDT auto-merges by intent (not last-write-wins).
- Conflicts surface in the Sync tab for manual review when needed.

---

## 9. CLI — `apivault`

Same vault, no GUI.

### 9.1 Install

The desktop installer adds it to PATH. Or:

```sh
brew install api-vault           # macOS
winget install api-vault         # Windows
cargo install api-vault-cli      # all platforms
```

### 9.2 Commands

```sh
apivault list [--issuer <slug>] [--env dev|staging|prod]
# Lists credentials (no values).

apivault reveal <id-or-name>
# Passphrase prompt → value to stdout. Exits in 30s.

apivault run <id-or-name> -- <command>
# Inject the credential into env vars then exec the command.
# Example: apivault run prod-stripe -- npm run deploy
```

### 9.3 Env-var injection (`run`)

`apivault run` puts only the chosen credentials into the child process's
environment. Map credential IDs to env var names with `apivault.json`:

```json
{
  "credentials": [
    { "id": "prod-stripe", "env": "STRIPE_SECRET_KEY" },
    { "id": "prod-openai", "env": "OPENAI_API_KEY" }
  ]
}
```

```sh
apivault run --config apivault.json -- node server.js
```

### 9.4 Security notes

- Plaintext lives only in the child process's memory; CLI zeroizes on exit.
- There's no `--print` flag by design — don't `echo` the result of
  `apivault reveal`.
- Be mindful of shell history. Use the value directly, don't capture it.

---

## 10. MCP server — Claude / Cursor / Copilot Chat

Talk to the vault via [Model Context Protocol](https://modelcontextprotocol.io).

### 10.1 Start the server

```sh
apivault mcp serve              # stdio (Claude Desktop / Cursor)
apivault mcp serve --port 3737  # SSE (Copilot Chat, etc.)
```

### 10.2 Exposed tools

| Tool                         | Description                                        |
| :--------------------------- | :------------------------------------------------- |
| `list_credentials`           | Metadata only, no values                           |
| `reveal_credential`          | Returns a value after a user OS confirm dialog     |
| `check_railguard_status`     | Whether RAILGUARD rules are present in the project |
| `suggest_railguard_template` | Generate per-editor ruleset draft                  |
| `check_supply_chain_risk`    | Run a supply-chain scan on the current project     |

### 10.3 Claude Desktop

`~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "api-vault": {
      "command": "apivault",
      "args": ["mcp", "serve"]
    }
  }
}
```

Restart, then in chat: `@api-vault list openai`.

### 10.4 Cursor

Settings → MCP → add the same JSON.

### 10.5 Permission model

- `reveal_credential` **always** requires an OS confirm dialog. AI cannot
  bypass it.
- Every call is recorded in the audit log.

---

## 11. VS Code extension

### 11.1 Install

- Search "API Vault" in the VS Code Marketplace.
- Or Open VSX with the same name.

### 11.2 Commands (palette)

- `API Vault: List credentials`
- `API Vault: Reveal credential` — passphrase prompt → clipboard.
- `API Vault: Scan workspace for supply-chain risk`

### 11.3 Language Model tools (1.96+)

Any chat host implementing the VS Code LM tool API — Copilot Chat, Claude,
Cursor — picks these up automatically.

- `#apivault` — list credentials.
- `#supplyrisk` — supply-chain scan.

### 11.4 Editor surface

- **Status bar** — shield icon → opens credential list.
- **Hover** — hover a dep line in `package.json` / `Cargo.toml` for the last
  scan's advisory tooltip.
- **Code lens** — risky dep lines get an inline "🔑 N advisor(ies)" lens.
  Click → Problems panel.
- **Problems panel** — diagnostics with source `api-vault`.

### 11.5 Settings

```json
{
  "apivault.cliPath": "apivault",
  "apivault.scanOnStartup": false
}
```

---

## 12. Backup and recovery

### 12.1 Backup

- Settings → **Export encrypted backup** → `.apivault-backup` file.
- The file is encrypted with your master passphrase — safe to put in cloud.
- Recommended: weekly + after any master-passphrase change.

### 12.2 Restore (new device or reinstall)

1. Pick **Restore from backup** on the first-launch screen.
2. Provide the backup file + master passphrase.
3. Done. Graph, usage, RAILGUARD rulesets — all preserved.

### 12.3 Lost master passphrase — Vault Charter

When you create a vault you can issue a **Vault Charter** — the only key that
can unlock the vault if the passphrase is lost. The relay server cannot help:
your data is end-to-end encrypted on this device.

Two modes (chosen at vault creation, changeable at recovery time):

- **Single charter** (recommended). 6 Diceware words + a 4-digit verifier.
  One sheet, store offline.

  ```
  TUNDRA HARBOR FLINT MOTH OPAL CASCADE - 7042
  ```

  The 4-digit verifier rejects single-word typos immediately — you do not
  silently end up with a useless recovery key.

- **Shamir 2-of-3** (advanced). Three sheets, any **two** reconstruct the
  charter. Distribute to family / lawyer / safe — losing one sheet does not
  lose the vault, and a single stolen sheet leaks zero bits about the secret.

To recover:

1. On the lock screen, click **Forgot your passphrase?**
2. Pick the mode you used (single / Shamir).
3. Type the charter (or any 2 of 3 shares) and a new passphrase.
4. The vault is reissued with the new passphrase. The old charter is now
   invalidated; a new charter is offered (recommended — the old one was on
   paper that may have leaked).

Optional **7-day cooldown** (Settings → Security): after a recovery, the
vault refuses to unlock for 7 days even with the correct new passphrase.
Defense in depth against "stolen laptop + stolen charter" — gives you time
to wipe the vault file remotely.

Lost the charter too? The data is unrecoverable. That is the trade-off of
Zero-Knowledge.

---

## 13. Troubleshooting

### 13.1 Windows — "Windows protected your PC" SmartScreen warning

**Symptom:** On first launch, Windows shows "Microsoft Defender SmartScreen
prevented an unrecognized app from starting."

**Cause:** Until we have a Windows OV/EV code-signing certificate (purchased
post-launch — not for v0.1.x), the installer is unsigned. SmartScreen
flags every unsigned `.exe` until enough users have installed it for
"reputation" to build.

**Fix (user):** Click **More info** → **Run anyway**. The vault is
otherwise unaffected — the binary is the same one built by GitHub Actions
from public, AGPL source.

**Fix (us, post-launch):** Once we ship an OV cert, this warning
disappears for new installs.

### 13.2 macOS — "App is damaged and can't be opened"

**Symptom:** macOS refuses to launch the app, says it's damaged.

**Cause:** Gatekeeper blocks un-notarized apps from unidentified developers.
For v0.1.x we have a Tauri update-signing key but no Apple Developer
notarization yet.

**Fix:**

```sh
xattr -cr "/Applications/API Vault.app"
```

The first command strips the quarantine attribute Gatekeeper added on
download. After that, double-click works normally.

Or, in the **Security & Privacy** pane, click **Open Anyway** after the
first failed launch.

### 13.3 Linux — `error while loading shared libraries: libwebkit2gtk-4.1.so.0`

**Symptom:** App fails with a missing-library error on Ubuntu/Debian.

**Cause:** Tauri v2 needs WebKit2GTK 4.1 (newer than the GTK 4.0 default
on some distros).

**Fix (Debian/Ubuntu):**

```sh
sudo apt-get install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

**Fix (Fedora/RHEL):**

```sh
sudo dnf install -y webkit2gtk4.1 libappindicator-gtk3
```

### 13.4 "Vault is locked" but you typed the right passphrase

**Possible causes:**

1. **Cooldown active** after a Charter recovery (default 7 days). Settings
   → Security → "Charter recovery cooldown" shows whether it's on.
   Solution: wait, or click **Clear cooldown** (audited).
2. **Wrong vault file.** The default is `~/.local/share/api-vault/vault.age`
   (Linux), `~/Library/Application Support/api-vault/vault.age` (macOS),
   `%APPDATA%\api-vault\vault.age` (Windows). If you migrated machines
   without copying this file, you have an empty new vault.
3. **Caps Lock or different keyboard layout.** Sounds obvious — it's still
   the #1 cause.

### 13.5 Auto-updater never finds a new version

**Symptom:** "You're up to date" even after a new GitHub Release.

**Diagnose:**

- Check **Settings → Updates** for the last-checked timestamp.
- Verify network reachability to `github.com` (the updater hits
  `releases/latest/download/latest.json`).
- For pre-release tags (`v0.1.0-pre1`), the updater **intentionally**
  skips them on the stable channel.

**Hard refresh:**

1. Quit the app.
2. Delete the updater cache:
   - macOS: `~/Library/Caches/api-vault/updater/`
   - Linux: `~/.cache/api-vault/updater/`
   - Windows: `%LOCALAPPDATA%\api-vault\Cache\updater\`
3. Relaunch.

### 13.6 CLI — `apivault: command not found`

The CLI binary is installed alongside the desktop app. Add it to your PATH:

| OS               | Path                                                  |
| :--------------- | :---------------------------------------------------- |
| macOS            | `/Applications/API Vault.app/Contents/MacOS/apivault` |
| Linux (deb/rpm)  | `/usr/bin/apivault`                                   |
| Linux (AppImage) | extract first, the binary is in `usr/bin/apivault`    |
| Windows          | `%LOCALAPPDATA%\Programs\api-vault\apivault.exe`      |

For convenience, symlink to a directory that's already on PATH:

```sh
# macOS
sudo ln -s "/Applications/API Vault.app/Contents/MacOS/apivault" /usr/local/bin/apivault

# Linux
sudo ln -s /usr/bin/apivault /usr/local/bin/apivault

# Windows (PowerShell as admin)
New-Item -ItemType SymbolicLink -Path "C:\Windows\apivault.exe" `
  -Target "$env:LOCALAPPDATA\Programs\api-vault\apivault.exe"
```

### 13.7 MCP server doesn't appear in Claude Desktop / Cursor

**Verify config:**

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). Section 10.3 of this guide has the exact JSON.
- Cursor: `~/.cursor/mcp.json`.

**Common pitfalls:**

- Path uses single backslashes on Windows — must be **double-escaped**
  in JSON: `"C:\\Users\\you\\..."`.
- Claude Desktop must be **fully quit** (not just closed) to reload the
  config: tray icon → Quit, then relaunch.
- Vault must be **unlocked** when the host calls `reveal_credential` —
  the MCP server queries the live desktop session. Lock = empty.

### 13.8 Charter recovery rejected — "Charter does not unlock this vault"

The Charter is verified by both **content** (6 words) and **verifier**
(the 4-digit number printed alongside). A single-letter typo in any word
will fail the SHA-256 check and reject before any decryption attempt.

Steps:

1. Re-check the **6 words** against your printed copy. Words use the
   EFF large wordlist — common short English words.
2. Re-check the **4-digit verifier** (a number from `0000` to `9999`).
   It's case-insensitive but must be exact.
3. For Shamir 2-of-3: only **2 of any 3** shares are needed. If you
   have all three, try different pair combinations — one share may have
   a typo while the other two are clean.

If the words are exactly right and recovery still fails, the vault file
itself may have been replaced (e.g., by an OS reinstall that overwrote
your data directory). In that case the Charter is for a different
vault and recovery is not possible.

---

## 14. FAQ

**Q. How is this different from 1Password / Bitwarden?**
A. They're vaults. We're vault + **dependency graph** + **blast-radius
simulation** + **supply-chain scan** + **RAILGUARD**, all in one view. You
see which code, deployments, and URLs depend on each key — and what breaks
when you revoke one.

**Q. What's free?**
A. Local vault, graph, incident feed, kill switch, RAILGUARD, supply-chain
scan, CLI, MCP server, VS Code extension — **all AGPL open source, all
unlimited**. Pro ($2/month or $15/year) adds multi-device E2EE sync,
auto-revoke, and auto-rotation.

**Q. What if your company shuts down?**
A. Your data stays on disk in plain SQLite (encrypted at rest). The CLI and
desktop app are AGPL — build it yourself and keep going.

**Q. Can the sync server read my keys?**
A. No. It only stores ChaCha20-Poly1305 ciphertext produced on your device.
The server source lives at [`/ee/`](../ee/) for verification.

**Q. I want to contribute.**
A. https://github.com/phoodul/api-vault — issues and PRs welcome. CLA
required before merge.

**Q. I found a security issue.**
A. PGP-encrypted email to security@api-vault.app. 90-day responsible
disclosure.

---

Last updated: 2026-05-02 — at M23 Vault Charter close + first prerelease infra.
