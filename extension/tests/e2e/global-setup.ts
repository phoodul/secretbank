// @file tests/e2e/global-setup.ts
// @license AGPL-3.0-or-later
//
// Playwright globalSetup — E2E 실행 전 임시 user-data-dir 생성.
// Manifest V3 unpacked extension 은 격리된 user-data-dir 에서 실행된다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export default async function globalSetup() {
  // 임시 user-data-dir 생성 (각 실행마다 깨끗한 Chrome profile)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-e2e-chrome-"));
  process.env.PLAYWRIGHT_USER_DATA_DIR = tmpDir;

  // globalTeardown 에서 삭제할 수 있도록 경로 파일에 기록
  fs.writeFileSync(
    path.join(os.tmpdir(), "sb-e2e-user-data-dir.txt"),
    tmpDir,
    "utf-8",
  );

  process.stderr.write(`[global-setup] user-data-dir: ${tmpDir}\n`);
}
