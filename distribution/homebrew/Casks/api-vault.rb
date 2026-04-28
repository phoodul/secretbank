# Homebrew Cask formula — submit to homebrew/cask-versions or
# (preferred) ship a tap at homebrew-api-vault.
#
# Run after a release has been signed + notarized to fill in the
# `sha256` for both arm64 and x86_64 builds.

cask "api-vault" do
  version "0.1.0"

  # Universal dmg (arm64 + x86_64) preferred. Until the universal pipeline
  # is in place, ship per-arch.
  arch arm: "aarch64", intel: "x64"

  url "https://github.com/api-vault/api-vault/releases/download/v#{version}/api-vault_#{version}_#{arch}.dmg",
      verified: "github.com/api-vault/api-vault/"

  sha256 arm:   "TBD-FILL-AFTER-RELEASE-BUILD-aarch64",
         intel: "TBD-FILL-AFTER-RELEASE-BUILD-x86_64"

  name "API Vault"
  desc "Dependency-graph-aware secrets manager with supply-chain risk detection"
  homepage "https://api-vault.app"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "API Vault.app"

  # Optional CLI symlink — installs `apivault` shim if the .app embeds it.
  binary "API Vault.app/Contents/MacOS/apivault"

  zap trash: [
    "~/Library/Application Support/api-vault",
    "~/Library/Caches/api-vault",
    "~/Library/Logs/api-vault",
    "~/Library/Preferences/app.api-vault.plist",
  ]
end
