# Release Guide — Secretbank

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

| Secret                       | Value                                          |
| :--------------------------- | :--------------------------------------------- |
| `APPLE_CERTIFICATE`          | base64 of the `.p12` file                      |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password                            |
| `APPLE_SIGNING_IDENTITY`     | "Developer ID Application: Your Name (TEAMID)" |
| `APPLE_ID`                   | your Apple developer email                     |
| `APPLE_PASSWORD`             | the app-specific password                      |
| `APPLE_TEAM_ID`              | the 10-char Team ID                            |

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

| Secret                         | Value                |
| :----------------------------- | :------------------- |
| `WINDOWS_CERTIFICATE`          | base64 of the `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password  |

### 3. Tauri updater signing key

The Tauri updater verifies its update manifest against a public key shipped
with the app.

```sh
pnpm tauri signer generate -w ~/.tauri/secretbank.key
```

Output: a private key (`secretbank.key`) and a public key. Add the public key
to `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Add the
private key to GitHub secrets as `TAURI_SIGNING_PRIVATE_KEY` and the
password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### 4. VS Code Marketplace + Open VSX

1. Create a publisher at https://marketplace.visualstudio.com/manage —
   publisher id must match `vscode-extension/package.json` `publisher`
   field (currently `secretbank`).
2. Generate a Personal Access Token at https://dev.azure.com/<your-org>
   with **Marketplace → Manage** scope.
3. Same for Open VSX at https://open-vsx.org/user-settings/tokens.

GitHub secrets:

| Secret     | Value                   |
| :--------- | :---------------------- |
| `VSCE_PAT` | VS Code Marketplace PAT |
| `OVSX_PAT` | Open VSX PAT            |

### 5. winget submission account

1. Fork https://github.com/microsoft/winget-pkgs.
2. We do **not** have automated upload — first time submissions require
   review. Subsequent updates can use the bot at
   https://github.com/microsoft/winget-create.

### 6. Homebrew tap (optional but recommended)

Create a separate repo `phoodul/homebrew-secretbank`. Users then install
with `brew install --cask phoodul/secretbank/secretbank`. The Cask file at
`distribution/homebrew/Casks/secretbank.rb` goes in that tap's `Casks/`
directory.

Eventually we can submit to `homebrew/cask` upstream once we have ≥ 75
GitHub stars and ≥ 30 days of releases.

### 7. Domain + landing

`secretbank.app` 은 Cloudflare Registrar 에 등록되어 있고, Pages 가
정적 컨텐츠 (`site/`) 를 서빙한다. 다운로드 / 자동 업데이터 경로는
Worker (`ee/cloudflare/download-proxy/`) 가 가로챈다.

```
secretbank.app/                 → Cloudflare Pages   (정적 site/)
secretbank.app/latest.json      → Cloudflare Pages   (정적 site/latest.json)
secretbank.app/releases.json    → Cloudflare Pages   (정적 site/releases.json)
secretbank.app/api/latest       → Worker download-proxy (latest.json passthrough + CORS)
secretbank.app/download/<tag>/* → Worker download-proxy (GitHub Releases CDN stream proxy)
```

랜딩 페이지 코드: `site/`. Worker 코드: `ee/cloudflare/download-proxy/`.
초기 deploy 절차는 위 9번 섹션 참조.

### 8. Stripe (Pro tier)

1. Create a Stripe account.
2. Create products: `Pro Monthly $2`, `Pro Annual $15`, `Team Monthly $5/user`.
3. Set up webhooks → Cloudflare Workers relay endpoint.
4. Pull publishable key into the desktop app's settings; secret key into
   the relay's secrets.

### 9. Cloudflare Worker download-proxy

`site/index.html` 의 다운로드 링크와 Tauri 자동 업데이터는 모두 `secretbank.app/download/*` 와 `secretbank.app/api/latest` 를 호출한다. 이 경로는 Cloudflare Pages (`secretbank.app/*` 정적 서빙) 와 별도로 Worker 가 가로채서 GitHub Releases CDN 으로 stream-forward 한다. github.com 도메인이 사용자에게 노출되지 않는다.

코드 위치: `ee/cloudflare/download-proxy/`. wrangler.toml 의 routes 가 `secretbank.app/download/*` 와 `secretbank.app/api/*` 를 등록.

**One-time deploy** (이 repo 의 root 에서):

```sh
cd ee/cloudflare/download-proxy
pnpm install
pnpm test            # 14 vitest cases — filename allowlist + tag regex + manifest passthrough
wrangler deploy
```

deploy 후 검증:

```sh
curl -I "https://secretbank.app/download/v0.1.0-pre8/secretbank_0.1.0_x64-setup.exe"   # 200 OK
curl    "https://secretbank.app/api/latest"                                              # site/latest.json 응답
```

route 충돌 점검 — Cloudflare 대시보드 → Workers & Pages → Routes 에서 `secretbank.app/download/*` 와 `secretbank.app/api/*` 가 download-proxy Worker 로 라우팅되는지 확인. Pages 가 먼저 응답하면 404 가 떨어진다.

**Fallback** — 별도 Worker + routes 방식이 동작하지 않으면 `ee/cloudflare/download-proxy/src/index.ts` 코드를 그대로 `site/functions/download/[[filename]].ts` + `site/functions/api/latest.ts` 로 복사 (Pages Functions 방식). 코드 100% 재사용.

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

1. Open https://github.com/phoodul/secretbank/actions/workflows/release.yml
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
  incorrectly. Re-copy with `Get-Content $HOME\.tauri\secretbank.key | Set-Clipboard`
  and re-add the secret.
- "Decryption failed" → `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` mismatch.
- macOS notarization step failure → APPLE\_\* secrets missing or wrong;
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
- **자동 commit `site/latest.json` + `site/releases.json` to main**
  (`publish-updater-manifest` job 끝에서 `[skip ci]` 로 main 에 푸시.
  Pages 가 즉시 재배포 → Worker `/api/latest` 가 새 버전 노출).

If a job fails, fix forward — do **not** edit the tag. Push a
`v0.1.0+1` patch tag instead.

### Post-release

- [ ] Smoke-test installers on each platform.
- [ ] Update `distribution/winget/manifest.yaml` with the new
      InstallerSha256 and submit a PR to microsoft/winget-pkgs.
- [ ] Update `distribution/homebrew/Casks/secretbank.rb` with the new
      sha256 in our tap repo.
- [ ] If Linux: `snapcraft upload secretbank_*.snap --release stable`.
- [ ] Tweet / Mastodon / HN announcement (only for x.0 / x.5 releases).
- [ ] Verify the in-app updater detects the new version on the previous
      version.

### Rollback

If a critical bug ships:

1. Mark the GitHub Release as **pre-release** (un-promotes it).
2. Edit `site/latest.json` on `main` to point to the previous version's
   bundles (URL 형식: `https://secretbank.app/download/<prev-tag>/...`).
   Commit + push — Pages 재배포 후 Worker `/api/latest` 가 즉시 반영.
   GitHub Release 의 `latest.json` asset 도 별개로 갱신 필요시:
   `gh release upload <prev-tag> latest.json --clobber`.
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
