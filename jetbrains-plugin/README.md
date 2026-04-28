# API Vault — JetBrains plugin

> Dependency-graph-aware secrets manager for IntelliJ IDEA, WebStorm,
> GoLand, PyCharm, Rider, RubyMine, CLion.

## Features

### Tools menu (`Tools → API Vault`)

- **List credentials** — popup chooser with metadata only.
- **Reveal credential…** — passphrase prompt → clipboard for 30 seconds.
- **Scan supply-chain risk** — runs the OSV scan on the current project,
  caches the result for inspections.

### Inspections

- `package.json` and `Cargo.toml` lines whose package matches a
  cached supply-chain advisory show as **WARNING** with severity +
  category + advisory ID inline.
- Run `Tools → API Vault → Scan supply-chain risk` first to populate
  the cache.

### Status bar

A small shield icon next to the IDE notifications area. Click to open
the credential list.

### Settings

`Settings → Tools → API Vault`:

- **CLI path** — defaults to `apivault` on PATH.
- **Scan on project open** (off by default).

## Requires

The desktop app's `apivault` CLI on your PATH.
Install: <https://api-vault.app/download>.

## Build

```sh
./gradlew buildPlugin            # creates build/distributions/api-vault-0.1.0.zip
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
