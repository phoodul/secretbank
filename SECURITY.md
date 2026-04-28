# Security Policy

API Vault stores secrets. Security is the product. We treat vulnerability
reports as the highest-priority class of issue.

## Supported versions

| Version | Support window |
| :------ | :------------- |
| Latest stable (`v0.x` series, `main`) | full support |
| One previous stable | security fixes only, 90 days after a new stable |
| Older | unsupported |

We will publish a CHANGELOG entry for every security-relevant fix.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Send an email to **security@api-vault.app**. PGP encryption is preferred —
fingerprint and public key are below.

Include:

- Affected component (desktop, CLI, MCP server, VS Code extension, relay).
- Version / commit hash if known.
- A clear reproduction. Proof-of-concept code is welcome.
- Whether a CVE / advisory is already public anywhere.

We acknowledge within **48 hours** and aim for a triage decision within
**5 business days**. If the issue is confirmed, we follow a **90-day
responsible disclosure** window: we publish the fix and advisory together
once a patched build is available, or at day 90, whichever comes first.

## What we consider in scope

- Confidentiality of vault contents (plaintext leakage from CPU, disk,
  IPC, logs, error messages, telemetry).
- Authenticity / integrity of sync ciphertext (relay manipulation,
  replay, swap-attacks).
- Authentication of devices (pairing, recovery, keyring access).
- Privilege-escalation paths in the desktop shell, the CLI, the MCP
  server, or the relay.
- Cryptographic implementation flaws (KDF parameters, AAD bindings,
  nonce reuse).

## What is out of scope

- Issues that require a compromised local OS user account already with
  full filesystem access.
- Social-engineering attacks against the user (we cannot patch a stolen
  passphrase).
- Lack of features that other products have ("X doesn't have FIDO2 yet"
  is a feature request, not a vulnerability).
- Dependencies' upstream advisories that we are still within the embargo
  window of.

## Bug bounty

We do not run a paid bounty program at this time. We do publicly credit
reporters in the CHANGELOG and in the advisory page on
https://api-vault.app/security unless you ask us not to.

## PGP key

```
Fingerprint: TBD-on-public-launch
```

The fingerprint will be pinned in the v1.0 release notes and on the
website. Until then, plain TLS email to security@api-vault.app is
acceptable — please mark the subject `[security]` and avoid reproducer
attachments larger than 10 MB.

## Audit history

| Date | Auditor | Scope | Report |
| :--- | :------ | :---- | :----- |
| TBD | TBD | TBD | TBD |

External audits are planned before v1.0. They will be linked here once
delivered.
