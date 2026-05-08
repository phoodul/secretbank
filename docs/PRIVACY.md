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

## 10. Contact

- privacy@secretbank.app — privacy questions, deletion requests.
- security@secretbank.app — vulnerabilities (PGP, see SECURITY.md).
- support@secretbank.app — everything else.
