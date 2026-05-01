# Release Guide — API Vault

This document is for maintainers cutting a release. It documents the
**one-time setup** (signing, certs, store accounts) and the **per-release
checklist**.

---

## One-time setup

### 1. Apple Developer (macOS notarization)

Cost: USD 99 / year. Required to ship `.dmg`/`.app` that opens without
"unidentified developer" warnings.

1. Sign up at https://developer.apple.com/programs/.
2. Create a **Developer ID Application** certificate (Keychain Access →
   Certificate Assistant → Request from CA → upload to developer.apple.com).
3. Download the `.cer`, install in login keychain.
4. Export as `.p12` with a password.
5. Generate an app-specific password at https://appleid.apple.com/account/manage
   for `notarytool`.
6. Note your Team ID (10-char string, top right of developer.apple.com).

Add to GitHub repo secrets:

| Secret | Value |
| :----- | :---- |
| `APPLE_CERTIFICATE` | base64 of the `.p12` file |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | "Developer ID Application: Your Name (TEAMID)" |
| `APPLE_ID` | your Apple developer email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | the 10-char Team ID |

### 2. Windows EV / OV code signing certificate

Cost: USD 200–400 / year (DigiCert / Sectigo). EV gives instant
SmartScreen reputation; OV slowly builds reputation as users install.
We recommend **OV** for v1.0 budget reasons.

1. Buy from a CA. They will issue on a hardware token (HSM); to use in
   CI you need an HSM-as-a-service add-on or a special exportable cert
   (more expensive).
2. Export as `.pfx` with a password. Store offline; only feed CI from
   GitHub secrets.

GitHub secrets:

| Secret | Value |
| :----- | :---- |
| `WINDOWS_CERTIFICATE` | base64 of the `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password |

### 3. Tauri updater signing key

The Tauri updater verifies its update manifest against a public key shipped
with the app.

```sh
pnpm tauri signer generate -w ~/.tauri/api-vault.key
```

Output: a private key (`api-vault.key`) and a public key. Add the public key
to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Add the
private key to GitHub secrets as `TAURI_SIGNING_PRIVATE_KEY` and the
password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### 4. VS Code Marketplace + Open VSX

1. Create a publisher at https://marketplace.visualstudio.com/manage —
   publisher id must match `vscode-extension/package.json` `publisher`
   field (currently `api-vault`).
2. Generate a Personal Access Token at https://dev.azure.com/<your-org>
   with **Marketplace → Manage** scope.
3. Same for Open VSX at https://open-vsx.org/user-settings/tokens.

GitHub secrets:

| Secret | Value |
| :----- | :---- |
| `VSCE_PAT` | VS Code Marketplace PAT |
| `OVSX_PAT` | Open VSX PAT |

### 5. winget submission account

1. Fork https://github.com/microsoft/winget-pkgs.
2. We do **not** have automated upload — first time submissions require
   review. Subsequent updates can use the bot at
   https://github.com/microsoft/winget-create.

### 6. Homebrew tap (optional but recommended)

Create a separate repo `phoodul/homebrew-api-vault`. Users then install
with `brew install --cask phoodul/api-vault/api-vault`. The Cask file at
`distribution/homebrew/Casks/api-vault.rb` goes in that tap's `Casks/`
directory.

Eventually we can submit to `homebrew/cask` upstream once we have ≥ 75
GitHub stars and ≥ 30 days of releases.

### 7. Domain + landing

Buy `api-vault.app` (or alternative). Point at Cloudflare Pages or
Vercel. The landing page lives in `site/` (TBD — separate from the
desktop app's `src/`).

### 8. Stripe (Pro tier)

1. Create a Stripe account.
2. Create products: `Pro Monthly $2`, `Pro Annual $15`, `Team Monthly $5/user`.
3. Set up webhooks → Cloudflare Workers relay endpoint.
4. Pull publishable key into the desktop app's settings; secret key into
   the relay's secrets.

---

## Per-release checklist

### Pre-flight

- [ ] All CI green on `main`.
- [ ] CHANGELOG.md updated with user-facing notes.
- [ ] `Cargo.toml` (`src-tauri/Cargo.toml` workspace + `package`) and
      `package.json` (root + `vscode-extension`) versions bumped to the
      target release.
- [ ] `src-tauri/tauri.conf.json` `version` field bumped.
- [ ] If schema migrations changed: migration test passes against last
      release's vault file.
- [ ] User-facing strings reviewed (en + ko at minimum).

### Dry-run pipeline check (recommended before first real tag)

Before pushing a real `v*` tag, you can verify the entire build/sign
pipeline without creating a GitHub Release. The Release workflow accepts
a `dry_run` boolean input via manual trigger.

1. Open https://github.com/phoodul/api-vault/actions/workflows/release.yml
2. Click **Run workflow** (top-right).
3. Leave `tag` at the default (`v0.0.0-dryrun`) and check **Dry run**.
4. **Run workflow**.

What runs:
- ✅ All 3 platform builds (macOS universal / Windows / Linux).
- ✅ Tauri signing key applied (verifies `TAURI_SIGNING_PRIVATE_KEY` +
  `_PASSWORD` secrets are valid; an unsigned bundle is OK if you haven't
  registered them yet).
- ✅ Bundles uploaded as **workflow artifacts** (downloadable from the
  run page for ~90 days).
- ❌ No GitHub Release created.
- ❌ No tag created/pushed.
- ❌ VS Code extension not published.

Common dry-run failure modes:
- "Invalid base64 secret key" → `TAURI_SIGNING_PRIVATE_KEY` was pasted
  incorrectly. Re-copy with `Get-Content $HOME\.tauri\api-vault.key | Set-Clipboard`
  and re-add the secret.
- "Decryption failed" → `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` mismatch.
- macOS notarization step failure → APPLE_* secrets missing or wrong;
  it's safe to ignore for a first dry-run if you haven't registered
  Apple Developer yet.
- Linux missing system deps → bug in `Install Linux system deps` step.

When dry-run is green, push the real tag.

### Cut the release

```sh
git checkout main
git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

The push triggers `.github/workflows/release.yml`:
- Creates a draft GitHub Release.
- Builds Tauri bundles on macOS / Windows / Linux runners.
- Signs + notarizes (macOS), signs (Windows) using the secrets above.
- Uploads .dmg, .app.tar.gz, .msi, .exe (NSIS), .deb, .AppImage, .rpm,
  and the updater manifest.
- Publishes the VS Code extension to Marketplace + Open VSX.
- Promotes the draft release to public.

If a job fails, fix forward — do **not** edit the tag. Push a
`v0.1.0+1` patch tag instead.

### Post-release

- [ ] Smoke-test installers on each platform.
- [ ] Update `distribution/winget/manifest.yaml` with the new
      InstallerSha256 and submit a PR to microsoft/winget-pkgs.
- [ ] Update `distribution/homebrew/Casks/api-vault.rb` with the new
      sha256 in our tap repo.
- [ ] If Linux: `snapcraft upload api-vault_*.snap --release stable`.
- [ ] Tweet / Mastodon / HN announcement (only for x.0 / x.5 releases).
- [ ] Verify the in-app updater detects the new version on the previous
      version.

### Rollback

If a critical bug ships:
1. Mark the GitHub Release as **pre-release** (un-promotes it).
2. Edit `latest.json` (Tauri updater manifest) to point to the previous
   version.
3. Open a hotfix branch, fix, cut `v0.1.1`.
4. Communicate via Incidents in the app + the website.

---

## Security cadence

- Quarterly: rotate all signing certs and CI tokens.
- Quarterly: dependency audit (`cargo audit`, `pnpm audit`, `npm audit`
  for vscode-extension).
- Yearly (before v1.0): external security audit.
- Yearly: refresh PRIVACY.md, TERMS.md, SECURITY.md timestamps even if no
  changes.
