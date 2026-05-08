/**
 * 출시 버전 일괄 bump — Cargo.toml (workspace + 모든 crate) + package.json
 * (root + vscode-extension) + tauri.conf.json + winget manifest 한 번에.
 *
 * 사용:
 *   pnpm version:bump 0.2.0
 *   pnpm version:bump --prerelease 0.2.0-pre1
 *
 * 검증 항목:
 *   - SemVer 형식 (X.Y.Z 또는 X.Y.Z-prerelease)
 *   - 모든 파일에 같은 버전 박힘 (이전에 mismatch 가 있던 경우 잡아냄)
 *   - dry-run 모드: --dry-run 으로 실제 쓰기 없이 변경 미리보기
 *
 * 후속:
 *   파일 변경 후 사용자 수동:
 *     git add -A && git commit -m "chore: bump v0.2.0"
 *     git tag -a v0.2.0 -m "v0.2.0"
 *     git push origin main && git push origin v0.2.0
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

interface BumpTarget {
  file: string;
  /** version 라인을 매칭하는 regex. group 1 = 따옴표/공백/구분자, group 2 = 버전 자체. */
  pattern: RegExp;
  /** group 1 + new version + tail 로 재구성. */
  rebuild: (oldLine: string, newVersion: string) => string;
}

function jsonVersionRebuild(oldLine: string, newVersion: string): string {
  return oldLine.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${newVersion}"`);
}

function tomlVersionRebuild(oldLine: string, newVersion: string): string {
  return oldLine.replace(/version\s*=\s*"[^"]+"/, `version = "${newVersion}"`);
}

function yamlPackageVersionRebuild(oldLine: string, newVersion: string): string {
  return oldLine.replace(/PackageVersion:\s*[\w.+-]+/, `PackageVersion: ${newVersion}`);
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

function parseArgs(): { version: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let version = "";
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (!a.startsWith("--")) version = a;
  }
  if (!version || !SEMVER.test(version)) {
    console.error("Usage: pnpm version:bump <X.Y.Z[-pre]> [--dry-run]");
    console.error("Examples: 0.2.0  /  0.2.0-pre1  /  1.0.0");
    process.exit(1);
  }
  return { version, dryRun };
}

async function collectTargets(): Promise<BumpTarget[]> {
  const targets: BumpTarget[] = [];

  // root package.json
  targets.push({
    file: resolve(REPO_ROOT, "package.json"),
    pattern: /^(\s*)"version"\s*:\s*"([^"]+)"/m,
    rebuild: jsonVersionRebuild,
  });

  // vscode-extension/package.json
  targets.push({
    file: resolve(REPO_ROOT, "vscode-extension/package.json"),
    pattern: /^(\s*)"version"\s*:\s*"([^"]+)"/m,
    rebuild: jsonVersionRebuild,
  });

  // tauri.conf.json
  targets.push({
    file: resolve(REPO_ROOT, "src-tauri/tauri.conf.json"),
    pattern: /^(\s*)"version"\s*:\s*"([^"]+)"/m,
    rebuild: jsonVersionRebuild,
  });

  // src-tauri/Cargo.toml (workspace + crates)
  for await (const f of glob("src-tauri/**/Cargo.toml", { cwd: REPO_ROOT })) {
    targets.push({
      file: resolve(REPO_ROOT, f as string),
      pattern: /^(version\s*=\s*)"([^"]+)"/m,
      rebuild: tomlVersionRebuild,
    });
  }

  // distribution/winget manifest
  const winget = resolve(REPO_ROOT, "distribution/winget/manifest.yaml");
  if (existsSync(winget)) {
    targets.push({
      file: winget,
      pattern: /^(PackageVersion:\s*)([\w.+-]+)/m,
      rebuild: yamlPackageVersionRebuild,
    });
  }

  // distribution/snap/snapcraft.yaml — version: '0.1.0'
  const snap = resolve(REPO_ROOT, "distribution/snap/snapcraft.yaml");
  if (existsSync(snap)) {
    targets.push({
      file: snap,
      pattern: /^(version:\s*)'([^']+)'/m,
      rebuild: (line, v) => line.replace(/^(version:\s*)'[^']+'/, `$1'${v}'`),
    });
  }

  // distribution/homebrew Cask
  const cask = resolve(REPO_ROOT, "distribution/homebrew/Casks/secretbank.rb");
  if (existsSync(cask)) {
    targets.push({
      file: cask,
      pattern: /^(\s*version\s+)"([^"]+)"/m,
      rebuild: (line, v) => line.replace(/^(\s*version\s+)"[^"]+"/, `$1"${v}"`),
    });
  }

  return targets;
}

async function main() {
  const { version, dryRun } = parseArgs();
  const targets = await collectTargets();

  console.log(`[version-bump] target version: ${version}${dryRun ? "  (dry-run)" : ""}`);
  console.log(`[version-bump] files to update: ${targets.length}\n`);

  let unchanged = 0;
  let updated = 0;
  for (const t of targets) {
    if (!existsSync(t.file)) {
      console.warn(`  miss   ${path.relative(REPO_ROOT, t.file)} (not found)`);
      continue;
    }
    const src = readFileSync(t.file, "utf-8");
    const m = src.match(t.pattern);
    if (!m) {
      console.warn(`  skip   ${path.relative(REPO_ROOT, t.file)}  (no version line)`);
      continue;
    }
    const oldVersion = m[2];
    if (oldVersion === version) {
      console.log(`  same   ${path.relative(REPO_ROOT, t.file)}  (${oldVersion})`);
      unchanged++;
      continue;
    }
    const oldLine = m[0];
    const newLine = t.rebuild(oldLine, version);
    const next = src.replace(oldLine, newLine);
    if (!dryRun) writeFileSync(t.file, next);
    console.log(`  bump   ${path.relative(REPO_ROOT, t.file)}  ${oldVersion} → ${version}`);
    updated++;
  }

  console.log(`\n[version-bump] updated: ${updated}, unchanged: ${unchanged}`);
  if (dryRun) console.log("[version-bump] dry-run — no files written");
  console.log("\nNext:");
  console.log(`  git add -A && git commit -m "chore: bump v${version}"`);
  console.log(`  git tag -a v${version} -m "v${version}"`);
  console.log(`  git push origin main && git push origin v${version}`);
}

void main();
