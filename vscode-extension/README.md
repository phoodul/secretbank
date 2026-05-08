# Secretbank — VS Code extension

> Dependency-graph-aware secrets manager with supply-chain risk detection.

## Features

### Commands (palette)

- **List credentials** — `Secretbank: List credentials` opens a Quick Pick.
- **Reveal credential** — pick one, enter your vault passphrase, value lands
  on the clipboard.
- **Scan supply chain** — `Secretbank: Scan workspace for supply-chain risk`
  parses `package.json`, asks OSV.dev whether any of your deps have a known
  secret-leak / supply-chain advisory, and surfaces hits in the Problems
  panel.

### Language Model tools (VS Code 1.96+)

Copilot Chat, Claude, Cursor — any chat host that implements VS Code's
language-model tool API picks these up automatically:

- `Secretbank_list_credentials` — read-only metadata, no secret values.
- `Secretbank_scan_supply_chain` — current workspace, optional
  `category_filter` (`secret_leak` / `supply_chain` / `any`).

Reference inline with `#Secretbank` and `#supplyrisk`.

### Editor surface

- Status bar item ($(shield) Secretbank → opens list).
- `package.json` hover — last scan's advisory tooltip on dep lines
  (run scan first to populate the cache).
- Problems panel diagnostics scoped to source `secretbank`.

## Requires

- The desktop app (`Secretbank` CLI) on your `PATH` (or set `Secretbank.cliPath`
  in settings). Install: <https://secretbank.app/download>.

## Why this exists

VS Code is where developers write the code that _uses_ their secrets. Pulling
the vault — and the supply-chain risk graph that surrounds it — into the
editor closes the loop: you see "this npm package has a credential-exfil
advisory" _before_ you commit the dependency, not after the breach mail.

## Roadmap

- v3 (M21-3): code-lens on risky `package.json` lines, Cargo.toml hover.
- M22: JetBrains plugin (IntelliJ / WebStorm / GoLand).
