# API Vault — VS Code extension

> Dependency-graph-aware secrets manager with supply-chain risk detection.

## Features (M21-1)

- **List credentials** — `API Vault: List credentials` opens a Quick Pick.
- **Reveal credential** — pick one, enter your vault passphrase, value lands
  on the clipboard.
- **Scan supply chain** — `API Vault: Scan workspace for supply-chain risk`
  parses `package.json`, asks OSV.dev whether any of your deps have a known
  secret-leak / supply-chain advisory, and surfaces hits in the Problems
  panel.

## Requires

- The desktop app (`apivault` CLI) on your `PATH` (or set `apivault.cliPath`
  in settings). Install: <https://api-vault.app/download>.

## Why this exists

VS Code is where developers write the code that *uses* their secrets. Pulling
the vault — and the supply-chain risk graph that surrounds it — into the
editor closes the loop: you see "this npm package has a credential-exfil
advisory" *before* you commit the dependency, not after the breach mail.

## Roadmap

- v2 (M21-2): native MCP server registration so Claude / Copilot Chat /
  Cursor can call the same tools without a separate config.
- v3: package.json hover with advisory tooltips.
