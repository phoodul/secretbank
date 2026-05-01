# Terms of Service — API Vault

Last updated: 2026-04-29.

These terms cover the use of:

- The API Vault desktop app, CLI, MCP server, and VS Code extension
  (collectively, the **"Software"**, licensed under AGPL-3.0-or-later).
- The **Pro service** (subscription account, multi-device sync relay,
  auto-revoke, auto-rotation), provided by **API Vault contributors**
  ("we", "us").

If you only use the open-source Software locally, the AGPL-3.0 license at
[`LICENSE`](../LICENSE) governs. These terms apply to the Pro service.

## 1. The agreement

By creating a Pro account, you accept these terms. If you do not, do not
create the account. The free Software remains available under AGPL-3.0
without subscription.

## 2. Account and eligibility

- You must be at least 18 years old, or the age of legal majority in
  your jurisdiction, whichever is higher.
- You agree to keep your master passphrase and Vault Charter (or Shamir
  shares) safe. We cannot recover them — see SECURITY and PRIVACY policies.
- One subscription = one human user. Sharing an account with multiple
  humans requires the **Team** tier (when available; see roadmap).

## 3. Pro service

- $2 USD / month or $15 USD / year, billed via Stripe. Local taxes added
  where applicable.
- Multi-device E2EE sync: up to 5 active devices per account.
- Auto-revoke and auto-rotation: subject to provider rate limits and to
  the providers' own terms.
- 99.5% monthly uptime target (excluding maintenance windows). If we
  miss it, we credit your next bill prorated.
- We may discontinue the Pro service with **180 days** advance notice
  and a documented data export path.

## 4. Acceptable use

You may not use the Software or the Pro service to:

- Store credentials you are not authorized to possess.
- Attack systems you do not have permission to test.
- Circumvent rate limits in ways that disrupt other users.
- Reverse-engineer the relay to extract another user's data (you can't,
  but the attempt is grounds for termination).

We reserve the right to suspend an account that we reasonably believe
is engaging in those activities, with notice and an appeal path.

## 5. Your data, your responsibility

The Software is a tool. Even with our best engineering, the
**confidentiality of your vault depends on your operational practices**:
choosing a strong passphrase, securing your devices, not pasting secrets
into untrusted chat windows, etc.

We provide:

- Strong defaults (Argon2id KDF, ChaCha20-Poly1305 AEAD, AAD bindings).
- Open-source code so you can verify the implementation.
- A documented threat model.

We do not provide:

- Recovery if you lose both passphrase and Vault Charter (impossible by
  design — Zero-Knowledge).
- Indemnity for losses caused by your operational mistakes.

## 6. Subscription, renewal, refunds

- Subscriptions auto-renew. Cancel any time in **Settings →
  Subscription** — the cancellation takes effect at the next renewal.
- **First 14 days**: full refund if you ask, no questions, on the
  monthly tier. Refunds outside that window are at our discretion.
- Annual subscribers: prorated refund if cancelled within 14 days; no
  refund afterwards (you continue to have full access until the term
  ends).
- We may change pricing with **30 days notice**; existing subscribers
  keep their current price for the current billing period.

## 7. Open source vs. Pro

- Anything in the repo root and `crates/` is AGPL-3.0. You can fork,
  modify, and self-host it; if you offer it as a network service, you
  must publish your modifications.
- Anything in `/ee/` is the **API Vault Enterprise License v1.0** (see
  `ee/LICENSE`). You can read the source for verification but production
  use requires a Pro subscription **or** a written enterprise license.

## 8. Disclaimer

THE SOFTWARE AND THE PRO SERVICE ARE PROVIDED "AS IS" WITHOUT WARRANTY
OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
NON-INFRINGEMENT. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF
IMPLIED WARRANTIES; IN THOSE JURISDICTIONS THE EXCLUSION APPLIES TO THE
MAXIMUM EXTENT PERMITTED.

## 9. Limitation of liability

To the maximum extent permitted by law, our total liability for any
claim arising out of or related to the Software or the Pro service is
limited to the amount you paid us in the **12 months** preceding the
event giving rise to the claim, or **USD 100**, whichever is greater.

We are not liable for indirect, incidental, special, consequential, or
punitive damages.

## 10. Indemnity

You will indemnify us against third-party claims arising from your
breach of these terms or your unlawful use of the Software or the Pro
service.

## 11. Governing law and disputes

Governing law: TBD before v1.0 launch (likely Delaware, USA, with
provision for users in the EU/UK to pursue claims in their local
jurisdiction). Disputes go to ordinary courts; no mandatory arbitration.

## 12. Changes

We may update these terms. Material changes are announced **30 days in
advance** via in-app notice and email to Pro subscribers. If you don't
agree, cancel before the new terms take effect.

## 13. Contact

legal@api-vault.app for these terms.
support@api-vault.app for everything else.
