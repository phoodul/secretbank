# Secretbank — JetBrains plugin

> Dependency-graph-aware secrets manager for IntelliJ IDEA, WebStorm,
> GoLand, PyCharm, Rider, RubyMine, CLion.

## Features

### Tool Window (`View → Tool Windows → Secretbank`)

Four tabs on the right side of the IDE:

- **Credentials** — live list with filter, refresh, and one-click reveal
  (passphrase prompt → clipboard, auto-clear in 30s).
- **Supply chain** — sortable advisory table with severity-coloured rows.
  Double-click a row to jump to the manifest line. Cached scan persists
  between Tool Window opens.
- **Graph** — dependency graph rendered inside JCEF (Issuer → Credential →
  Project → Deployment). Self-contained force-directed layout.
  - **Click** selects a node (highlights neighbors).
  - **Double-click** triggers the default action for that kind:
    Credential → reveal to clipboard, Issuer → docs URL,
    Project → repo URL, Deployment → URL.
  - **Right-click** opens a context menu: _Show blast radius_ (for
    credentials only — colours downstream nodes red/orange/yellow by
    BFS depth, dims the rest, shows a "N nodes affected" banner),
    _Reveal_, _Open repo/docs/URL_, _Focus_, _Copy ID_.
  - **Filter box** dims non-matching nodes/edges.
  - **Keyboard**: `Ctrl/Cmd + F` focus search, `Esc` clear all
    highlights and filter, `Ctrl/Cmd + 0` fit to view.
  - **Center** / **Clear highlight** buttons in the toolbar.

  No external CDN — works offline. Falls back to a notice on IDE
  builds without JCEF.

- **Settings** — per-project CLI path and "scan on project open" toggle.

### Tools menu (`Tools → Secretbank`)

- **List credentials** — popup chooser.
- **Reveal credential…** — passphrase prompt → clipboard.
- **Scan supply-chain risk** — runs the OSV scan, caches for inspections.

### Inspections

- `package.json`, `Cargo.toml` (and via the line parser also
  `requirements.txt` / `go.mod` patterns) whose package matches a
  cached supply-chain advisory show as **WARNING** with severity +
  category + advisory ID inline.

### Status bar

Shield icon next to the IDE notifications area. Click to open the
credential list.

### Auto-scan on open

If **Scan on project open** is enabled in the Settings tab, the
plugin runs a supply-chain scan in the background when the project
loads. Result is cached so the Tool Window's Supply chain tab
populates immediately.

## Requires

The desktop app's `Secretbank` CLI on your PATH.
Install: <https://secretbank.app/download>.

## Build

```sh
./gradlew buildPlugin            # creates build/distributions/secretbank-0.1.0.zip
./gradlew runIde                 # launches a sandboxed IntelliJ Community to test
./gradlew test                   # unit tests
./gradlew verifyPlugin           # JetBrains Marketplace pre-flight
```

## Publish

```sh
JETBRAINS_MARKETPLACE_TOKEN=<pat> ./gradlew publishPlugin
```

PAT from <https://plugins.jetbrains.com/author/me/tokens>.

## License

AGPL-3.0-or-later.
