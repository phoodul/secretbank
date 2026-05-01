/**
 * 마지막 release 이후의 conventional commits 를 모아 CHANGELOG 항목 초안 생성.
 *
 * 사용:
 *   pnpm changelog:gen v0.1.0 v0.2.0
 *   pnpm changelog:gen v0.1.0           # to = HEAD
 *
 * 출력은 stdout 으로 markdown — 사용자가 검토 후 CHANGELOG.md 의 적절한
 * 섹션에 붙여넣음 (자동 인서트 X — 사람이 마지막에 다듬어야 launch quality).
 *
 * 분류 규칙 (conventional commit type):
 *   - feat    → ### Added
 *   - fix     → ### Fixed
 *   - perf    → ### Performance
 *   - refactor / chore (release) → ### Changed
 *   - docs / test / ci / build / style → 무시 (release-note 가치 낮음)
 *
 * scope 가 있으면 prefix 로 표시: "feat(release): ..." → "release: ..."
 */
import { spawnSync } from "node:child_process";

interface ConventionalCommit {
  hash: string;
  type: string;
  scope: string | null;
  subject: string;
  breaking: boolean;
}

function gitLog(from: string, to: string): string[] {
  // %h = short hash, %s = subject, separated by tab
  const args = ["log", "--no-merges", "--pretty=format:%h%x09%s", `${from}..${to}`];
  const result = spawnSync("git", args, { encoding: "utf-8" });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
  return result.stdout.split("\n").filter(Boolean);
}

const CC_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function parse(line: string): ConventionalCommit | null {
  const [hash, subject] = line.split("\t");
  if (!hash || !subject) return null;
  const m = subject.match(CC_RE);
  if (!m) return null;
  return {
    hash,
    type: m[1].toLowerCase(),
    scope: m[2] ?? null,
    breaking: !!m[3],
    subject: m[4],
  };
}

const CATEGORY: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Performance",
  refactor: "Changed",
  chore: "Changed",
  revert: "Changed",
};

function main() {
  const args = process.argv.slice(2);
  const from = args[0];
  const to = args[1] ?? "HEAD";
  if (!from) {
    console.error("Usage: pnpm changelog:gen <from-tag> [to-tag|HEAD]");
    console.error("Example: pnpm changelog:gen v0.1.0 v0.2.0");
    process.exit(1);
  }

  const lines = gitLog(from, to);
  const buckets: Record<string, ConventionalCommit[]> = {
    Added: [],
    Fixed: [],
    Performance: [],
    Changed: [],
    Breaking: [],
  };

  for (const l of lines) {
    const cc = parse(l);
    if (!cc) continue;
    if (cc.breaking) {
      buckets.Breaking.push(cc);
      continue;
    }
    const cat = CATEGORY[cc.type];
    if (!cat) continue; // skip docs/test/ci/build/style
    buckets[cat].push(cc);
  }

  const date = new Date().toISOString().slice(0, 10);
  const headerVersion = to === "HEAD" ? "Unreleased" : to.replace(/^v/, "");
  console.log(`## [${headerVersion}] - ${date}\n`);

  for (const cat of ["Breaking", "Added", "Fixed", "Performance", "Changed"]) {
    const items = buckets[cat];
    if (items.length === 0) continue;
    const heading = cat === "Breaking" ? "⚠️ Breaking Changes" : cat;
    console.log(`### ${heading}\n`);
    for (const c of items) {
      const scope = c.scope ? `**${c.scope}:** ` : "";
      console.log(`- ${scope}${c.subject} (\`${c.hash}\`)`);
    }
    console.log();
  }

  if (Object.values(buckets).every((b) => b.length === 0)) {
    console.log("_No release-worthy commits in this range._\n");
  }

  console.log(
    `\n[generated from \`${from}..${to}\` — review carefully before pasting into CHANGELOG.md]`,
  );
}

main();
