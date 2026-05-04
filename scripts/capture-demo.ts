/**
 * Marketing 영상 캡처 — `e2e/demo.spec.ts` 를 Playwright 로 실행하고,
 * 생성된 webm 비디오 들을 `media/<scene>.webm` 로 복사한다.
 *
 * 산출물:
 *   media/lock-screen.webm       — sci-fi HUD + 15-language switcher
 *   media/charter-issuance.webm  — Lapis vault charter (marquee 차별화)
 *   media/recovery-flow.webm     — RecoveryDialog (Forgot passphrase)
 *
 * 사용:
 *   pnpm capture:demo
 *
 * 결과 활용:
 *   - HN/PH 게시: 단일 클립 사용 또는 ffmpeg 으로 concat
 *   - 사이트 (`site/index.html`): hero 섹션 inline video tag 로 임베드
 *   - 트위터: webm → mp4 변환 (Twitter 는 mp4 만 지원)
 *
 * Tauri 백엔드는 `e2e/lib/tauri-mock.ts` 가 mock 처리 — 실제 vault 파일을
 * 만들지 않으므로 안전하게 반복 가능.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const TEST_RESULTS = path.join(REPO_ROOT, "test-results");
const MEDIA_DIR = path.join(REPO_ROOT, "media");

const SCENES: Record<string, string> = {
  // demo title (in spec.ts) → output filename
  "demo lock-screen": "lock-screen.webm",
  "demo charter-issuance": "charter-issuance.webm",
  "demo recovery-flow": "recovery-flow.webm",
  "demo save-credential": "save-credential.webm",
  "demo dependency-graph": "dependency-graph.webm",
  "demo incident-alert": "incident-alert.webm",
  "demo rotate-credential": "rotate-credential.webm",
  "demo stale-references": "stale-references.webm",
};

function ensureViteBuild(): boolean {
  console.log("[capture-demo] Building vite (production) for fast page mount...");
  const r = spawnSync("npx", ["vite", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error("[capture-demo] vite build failed");
    return false;
  }
  return true;
}

function runPlaywright(): number {
  console.log("[capture-demo] Running Playwright on e2e/demo.spec.ts (preview mode)...");
  const args = ["playwright", "test", "--config=e2e/playwright.demo.config.ts"];
  const result = spawnSync("npx", args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function findRecentWebm(testDir: string, sceneTitle: string): string | null {
  if (!existsSync(testDir)) return null;
  // Playwright 디렉토리 명명 규칙: `<spec-file>-<test-title>-<browser>/video.webm`
  // sceneTitle = "demo lock-screen" → 디렉토리 이름은 hyphenated form
  const slug = sceneTitle.replace(/[\s:]+/g, "-");
  const candidates = readdirSync(testDir).filter((d) => d.includes(slug));
  for (const c of candidates) {
    const dir = path.join(testDir, c);
    if (!statSync(dir).isDirectory()) continue;
    const inner = readdirSync(dir).filter((f) => f.endsWith(".webm"));
    if (inner.length > 0) return path.join(dir, inner[0]);
  }
  return null;
}

/**
 * Playwright 가 page.goto 직후부터 record 시작 — React mount + 첫 paint 까지
 * 약 1.5초 동안 흰 frame 들이 webm 앞에 붙는다. ffmpeg 로 trim + reencode 해서
 * 첫 1.5초 cut. ffmpeg 없으면 silent fallback (단순 copy).
 */
/**
 * Playwright 가 page.goto 직후부터 record 시작 — React mount + 첫 paint 까지
 * 약 3초 흰 frame. 그리고 spec 마지막 wait 후 추가로 약 2초 정적 frame.
 * → 앞 3초 trim + 영상 길이 12초로 cap (carousel 의 MAX_SHOW_MS 와 매칭).
 *
 * `-ss` 를 input 앞에 두면 fast seek (keyframe), 정확하지 않을 수 있음.
 * 정확한 trim 위해 `-ss` 를 input 뒤에 두고 reencode + cfr (constant frame
 * rate) 강제 — 결과 webm 의 duration 이 정확히 (원본 - 3) 초.
 */
function trimLeadingWhite(src: string, dst: string): boolean {
  const trimmed = dst + ".tmp.webm";
  const args = [
    "-y",
    "-i",
    src,
    "-ss",
    "1.5", // prod build 는 mount 빠르므로 1.5s 만 cut
    "-t",
    "10.0", // carousel MAX_SHOW_MS=10s 와 매칭
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "1.2M",
    "-deadline",
    "realtime",
    "-cpu-used",
    "5",
    "-r",
    "25",
    "-fps_mode",
    "cfr",
    "-an",
    trimmed,
  ];
  const r = spawnSync("ffmpeg", args, { stdio: "pipe" });
  if (r.status !== 0) {
    return false;
  }
  copyFileSync(trimmed, dst);
  unlinkSync(trimmed);
  return true;
}

function copyArtifacts() {
  if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });
  const summary: { scene: string; output: string; size_kb: number; trimmed: boolean }[] = [];
  for (const [sceneTitle, outName] of Object.entries(SCENES)) {
    const src = findRecentWebm(TEST_RESULTS, sceneTitle);
    if (!src) {
      console.warn(`[capture-demo] no video found for "${sceneTitle}"`);
      continue;
    }
    const dst = path.join(MEDIA_DIR, outName);
    const trimmed = trimLeadingWhite(src, dst);
    if (!trimmed) {
      copyFileSync(src, dst);
      console.warn(`[capture-demo] ffmpeg unavailable — copied raw for "${sceneTitle}"`);
    }
    const size = Math.round(statSync(dst).size / 1024);
    summary.push({
      scene: sceneTitle,
      output: path.relative(REPO_ROOT, dst),
      size_kb: size,
      trimmed,
    });
  }
  console.log("\n[capture-demo] Output (1.5s leading-white trimmed):");
  for (const row of summary) {
    const tag = row.trimmed ? "✂" : "·";
    console.log(`  ${tag} ${row.scene.padEnd(28)} → ${row.output}  (${row.size_kb} KB)`);
  }
  if (summary.length === 0) {
    console.error("[capture-demo] No artifacts produced. Did Playwright actually run?");
    process.exit(2);
  }
}

if (!ensureViteBuild()) process.exit(2);
const code = runPlaywright();
if (code !== 0) {
  console.error(`[capture-demo] Playwright exited with code ${code}`);
  // 영상 일부라도 캡처됐을 수 있으니 그래도 copy 시도
}
copyArtifacts();
console.log("\n[capture-demo] Done.\n");
console.log("Tip — convert to mp4 for Twitter / Product Hunt:");
console.log(
  "  ffmpeg -i media/lock-screen.webm -c:v libx264 -pix_fmt yuv420p media/lock-screen.mp4",
);
