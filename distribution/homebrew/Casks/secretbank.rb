# Homebrew Cask formula — submit to homebrew/cask-versions or
# (preferred) ship a tap at homebrew-secretbank.
#
# Run after a release has been signed + notarized to fill in the
# `sha256` for both arm64 and x86_64 builds.

cask "secretbank" do
  version "0.1.0-pre16"

  # Universal dmg (arm64 + x86_64) preferred. Until the universal pipeline
  # is in place, ship per-arch.
  arch arm: "aarch64", intel: "x64"

  url "https://github.com/phoodul/secretbank/releases/download/v#{version}/secretbank_#{version}_#{arch}.dmg",
      verified: "github.com/phoodul/secretbank/"

  sha256 arm:   "TBD-FILL-AFTER-RELEASE-BUILD-aarch64",
         intel: "TBD-FILL-AFTER-RELEASE-BUILD-x86_64"

  name "Secretbank"
  desc "Dependency-graph-aware secrets manager with supply-chain risk detection"
  homepage "https://secretbank.app"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Secretbank.app"

  # Optional CLI symlink — installs `secretbank` shim if the .app embeds it.
  binary "Secretbank.app/Contents/MacOS/secretbank"

  zap trash: [
    "~/Library/Application Support/secretbank",
    "~/Library/Caches/secretbank",
    "~/Library/Logs/secretbank",
    "~/Library/Preferences/app.secretbank.plist",
  ]
end
