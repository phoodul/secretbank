# Privacy Policy — Secretbank

Last updated: 2026-04-29.

This is the privacy policy for the Secretbank desktop app, CLI, MCP server,
VS Code extension, and the optional Pro sync service. We tried to write it
in plain language. If anything is unclear, please email
privacy@secretbank.app.

## TL;DR

- The free desktop app, CLI, MCP server, and VS Code extension run **fully
  on your device**. We do not see your secrets. We do not see your
  dependency graph. We do not see what you scan.
- The optional **Pro sync** service stores **only ciphertext**. The relay
  servers cannot decrypt your data. They cannot see credential names,
  graph nodes, or any plaintext metadata.
- We collect **no analytics by default**. If you opt in, the data set is
  documented below and you can revoke at any time.
- We do not sell data. We do not have a "data partner program". We do not
  have ad networks. The product is funded by the Pro subscription.

---

## 1. What runs locally

The desktop app, CLI, MCP server, and VS Code extension store everything
on your device:

- Encrypted vault — `<OS data dir>/secretbank/vault.db` (SQLite, encrypted
  with `age` + ChaCha20-Poly1305 derived from your master passphrase).
- Audit log — same SQLite file, encrypted at rest.
- Dependency graph and supply-chain scan results — same SQLite file.
- RAILGUARD ruleset templates — generated to your project folders only
  when you ask.

We **never** transmit any of these to our servers in the free tier.

---

## 2. What contacts the network in the free tier

With Pro disabled and telemetry off, the only outbound connections are:

| Destination                                                            | Purpose                         | Data sent                                                             |
| :--------------------------------------------------------------------- | :------------------------------ | :-------------------------------------------------------------------- |
| `services.nvd.nist.gov`, `api.github.com/advisories`, issuer RSS feeds | Incident feed polling           | Version strings of public feeds — no vault data                       |
| `api.osv.dev`                                                          | Supply-chain scan               | Package ecosystem + name + version of dependencies you choose to scan |
| `api.github.com`                                                       | Updater check (signed manifest) | Your app version                                                      |

You can disable each of these in **Settings → Network**. The feed and
supply-chain scan are local-only after disable; the updater check becomes
manual.

---

## 3. What the Pro sync service stores

If you enable Pro multi-device sync:

- **Ciphertext** of your vault state, produced on your device with keys we
  cannot derive. AAD-bound to `user:<userId>:cred:<credId>` so even we
  cannot swap one user's record into another's account.
- **A randomly generated user ID** (UUID) so the relay can route
  ciphertext to the correct device set.
- **A device public key** (X25519) per registered device.
- **Sync timestamps** for last-write resolution.

What we cannot see, even with full server compromise:

- Your master passphrase.
- The plaintext of any credential, label, note, or graph node.
- Which issuers you store credentials for.
- Which projects you scan.
- Anything that would identify you beyond the random UUID.

The relay code is open under the Enterprise Edition license at
[`/ee/`](../ee/). You can self-host it.

---

## 4. Optional anonymous telemetry (off by default)

If you opt in via **Settings → Privacy → Anonymous telemetry**:

- Crash reports — stack trace, OS version, app version. **Stripped** of
  paths, file names, and any string that looks like a token.
- Feature usage counters — e.g. "Reveal was used N times this week",
  bucketed weekly. No timestamps below the day.
- Performance metrics — local query latencies, no payload content.

We **do not** collect:

- Any credential, partial credential, label, or note.
- Hostnames, IP addresses (the relay strips these at ingress), or
  geolocation.
- Browsing history, file system contents, or process names beyond our
  own.

You can turn telemetry off at any time. Past data is purged within 30
days.

---

## 5. Account data (Pro only)

If you subscribe to Pro:

- Email address (for license + support).
- Stripe customer ID (we do **not** store card numbers — Stripe does).
- Subscription tier and renewal date.

Stripe's privacy policy applies to payment processing:
https://stripe.com/privacy.

To delete your Pro account: email privacy@secretbank.app. We delete the
account record and stop billing within 7 days. Local vault data is
**unaffected** — it lives only on your device.

---

## 6. Data retention

| Data class              | Retention                                                  |
| :---------------------- | :--------------------------------------------------------- |
| Local vault             | Until you delete it on your device                         |
| Pro ciphertext on relay | Until you delete the device or unsubscribe + 30 days grace |
| Anonymous telemetry     | 30 days                                                    |
| Stripe customer record  | Per Stripe's policy + our books (legal minimum)            |
| Email support thread    | 1 year, or until you ask us to delete it                   |

---

## 7. Your rights

Where applicable (GDPR, CCPA, etc.):

- **Access** — email privacy@secretbank.app to request a copy of any data
  tied to your account.
- **Correction** — same address.
- **Deletion** — same address. Local data is your own to delete.
- **Portability** — the desktop app's **Export encrypted backup** is the
  primary export path. Server-side records are minimal and delivered as
  JSON on request.
- **Complaint** — your local data protection authority.

We are not required to verify identity beyond owning the email on file
for Pro accounts. We **cannot** decrypt your vault to fulfill a request,
because we do not hold the keys.

---

## 8. Children

Secretbank is not directed at children under 13 (16 in the EU). We do not
knowingly collect their data.

---

## 9. Changes

If the policy materially changes, we publish the new version with the
date at the top, and Pro users get an email. Past versions are retained
in git history at https://github.com/phoodul/secretbank/commits/main/docs/PRIVACY.md.

---

## 10. Browser Extension (Chrome / Firefox)

The Secretbank browser extension collects and stores data as described below.

### 10.1 Native Messaging channel

The extension communicates with the Secretbank **desktop app** via the
browser's Native Messaging API. This channel:

- Carries only encrypted payloads (X25519 key exchange +
  ChaCha20-Poly1305 AEAD, derived during the one-time pairing step).
- Is a local loopback — no data exits the device through this channel.
- Requires the desktop app to be running and paired.

The native host binary (`secretbank-nm-host`) is registered in the OS
native messaging host manifest. No data from this channel is sent to any
server.

### 10.2 What the extension stores in `chrome.storage.local`

| Key | Purpose | TTL |
| :-- | :------ | :-- |
| `pairing` | Extension ↔ Desktop pairing info (X25519 key pair + device ID + timestamp) | Until re-pair or uninstall |
| `session_token` | HMAC-SHA256 session token cache — avoids vault re-auth on every popup open | Until expiry (set by desktop) |
| `secretbank_never_save_domains` | User's "never save on this site" list — array of hostname strings | Permanent (user-managed) |
| `secretbank_pending_save` | Temporary credential capture from in-page SaveBanner (password plaintext for ≤ 5 min) | 5-minute TTL, deleted immediately after save/cancel |
| `secretbank_supply_dismissed_v1` | Supply-chain banner dismiss timestamps per hostname | 7-day TTL per entry |
| `secretbank_supply_cache_v1` | Cached incident-check API responses per hostname | 1-hour TTL |
| `secretbank_railguard_dismissed_v1` | RAILGUARD hint banner dismiss timestamps per hostname | 7-day TTL per entry |

No credential plaintexts, vault keys, or master passphrase are ever
written to `chrome.storage.local` beyond the 5-minute pending-save
window (which is cleared immediately on save or cancel).

The X25519 private key stored under `pairing` is written as base64
plaintext. It is protected by your OS profile's file-system permissions
(BitLocker / FileVault / Linux dm-crypt). Threat model detail: see
`docs/task_m24e.md` T7.

### 10.3 What the extension stores in `chrome.storage.session`

Session storage is cleared when the browser session ends (tab/window
close or browser restart).

| Key | Purpose | TTL |
| :-- | :------ | :-- |
| `secretbank_mcp_opt_in_cache_v1` | Cached opt-in flag for MCP context push (fetched from desktop) | 5-minute TTL |
| `secretbank_mcp_last_push_v1` | Per-hostname timestamp of last MCP context push (rate-limit) | Until browser session ends |

### 10.4 External network requests made by the extension

| Destination | Purpose | Data sent | User control |
| :---------- | :------ | :-------- | :----------- |
| `https://www.google.com/s2/favicons` | Site logo fallback — fetches a favicon for the current site's hostname | **Hostname only** — no user ID, no session token, no vault data | Favicon falls back to letter-avatar if request fails; future release will replace with `api.secretbank.app/favicon/{host}` (self-controlled proxy) |

All other extension network requests go through the local Native
Messaging channel to the desktop app, which applies its own outbound
policy (see §2 above).

MCP context push is **opt-in and off by default**. When enabled, only
credential metadata (ID + name + issuer) — never plaintext secrets — is
forwarded to the desktop app's MCP queue, which remains on-device.

### 10.5 Permissions used by the extension

| Permission | Why it is needed |
| :--------- | :--------------- |
| `activeTab` | Read the current page's URL and hostname for autofill matching, credential saving, and supply-chain banner |
| `storage` | `chrome.storage.local` and `chrome.storage.session` — see §10.2 and §10.3 |
| `nativeMessaging` | Communicate with the Secretbank desktop app over an encrypted local channel |
| `scripting` (optional, if added) | Inject autofill values into form fields |
| `contextMenus` (optional, if added) | Right-click autofill shortcut |

The extension targets `<all_urls>` in its content script in order to
detect credential-entry forms on any website. It does **not** read page
content beyond identifying form fields; no page text is sent anywhere.

---

## 11. Contact

- privacy@secretbank.app — privacy questions, deletion requests.
- security@secretbank.app — vulnerabilities (PGP, see SECURITY.md).
- support@secretbank.app — everything else.
