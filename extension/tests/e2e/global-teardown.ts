// @file tests/e2e/global-teardown.ts
// @license AGPL-3.0-or-later
//
// Playwright globalTeardown — E2E 실행 후 임시 user-data-dir 정리.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export default async function globalTeardown() {
  const markerFile = path.join(os.tmpdir(), "sb-e2e-user-data-dir.txt");
  if (fs.existsSync(markerFile)) {
    const tmpDir = fs.readFileSync(markerFile, "utf-8").trim();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      process.stderr.write(`[global-teardown] user-data-dir 삭제: ${tmpDir}\n`);
    }
    fs.unlinkSync(markerFile);
  }
}
