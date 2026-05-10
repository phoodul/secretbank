# Firefox E2E — 옵션 D (Build Smoke + Manifest Validation)

## 왜 옵션 D인가?

Firefox 브라우저 확장 E2E 에는 네 가지 접근 방식이 있다:

| 옵션 | 수단 | 장점 | 단점 |
|------|------|------|------|
| **A** | web-ext + Selenium | 표준적, 실제 Firefox 실행 | geckodriver 설치, 복잡한 CI setup |
| **B** | web-ext run + smoke | 단순, profile 로딩 검증 | 깊은 E2E 불가, CI headless 문제 |
| **C** | Playwright Firefox | 한 도구로 Chromium + Firefox | MV3 미지원 (Firefox는 MV2 기본) |
| **D (채택)** | build smoke + manifest validation | 단순, CI 즉시 통합 가능 | 실제 브라우저 실행 없음 |

**옵션 D 채택 이유**:

1. **WXT + Firefox = MV2 기본값**: WXT `--browser firefox` 빌드는 Manifest V2 를 생성한다. Playwright Firefox 는 MV3 extension 부분 지원 (109+), MV3 완전 지원 (121+) 이지만 MV2 로딩은 미지원.

2. **Chromium 풀 E2E (F-3) 로 커버**: autofill, save, generator 시나리오는 이미 Playwright Chromium MV3 E2E (F-3, `tests/e2e/`) 에서 검증된다. Firefox 고유 버그는 주로 manifest 형식 차이에서 발생한다.

3. **Phase F-2 에서 정식 정비**: Safari/Edge 지원 추가 시 web-ext + Selenium/geckodriver 기반 풀 E2E 를 함께 정비한다. 지금 복잡도를 늘릴 이유가 없다.

4. **회귀 방지에 충분**: `wxt build --browser firefox` 가 깨지는 경우(타입 에러, manifest 구조 변경, entry 누락)를 즉각 감지한다.

## 테스트 파일

| 파일 | 내용 |
|------|------|
| `build-smoke.test.ts` | Firefox 빌드 실행 → `dist/firefox-mv2/` 폴더·주요 entry 파일 존재 확인 |
| `manifest-validation.test.ts` | `manifest.json` Firefox MV2 스펙 준수 검증 (필수 필드, permissions, content_scripts, browser_action) |

## 실행 방법

```bash
# extension/ 디렉토리에서
pnpm test                    # 전체 (unit + web-ext smoke)
pnpm vitest run tests/web-ext  # web-ext 테스트만

# 빌드 재사용 (CI에서 이미 빌드한 경우)
SKIP_FIREFOX_BUILD=true pnpm vitest run tests/web-ext
```

## CI 통합

`.github/workflows/extension-e2e.yml` 의 `firefox-build` job 이 이 테스트를 실행한다:

1. `pnpm --filter @secretbank/extension build:firefox` — Firefox MV2 빌드
2. `SKIP_FIREFOX_BUILD=true pnpm --filter @secretbank/extension vitest run tests/web-ext` — 빌드 결과 검증

## Phase F-2: 풀 E2E 통합 가이드

Phase F-2 (Safari/Edge 정식 지원) 시점에 Firefox 풀 E2E 를 추가할 때 참고할 사항:

### 필요 도구

```bash
npm install -g web-ext          # Mozilla 공식 CLI
brew install geckodriver         # macOS
apt-get install geckodriver      # Ubuntu (또는 직접 다운로드)
pip install selenium             # Python Selenium (또는 npm install selenium-webdriver)
```

### CI 추가 항목

```yaml
- name: geckodriver 설치
  run: |
    GECKO_VER=$(curl -s https://api.github.com/repos/mozilla/geckodriver/releases/latest | jq -r .tag_name)
    curl -L "https://github.com/mozilla/geckodriver/releases/download/${GECKO_VER}/geckodriver-${GECKO_VER}-linux64.tar.gz" | tar xz
    sudo mv geckodriver /usr/local/bin/

- name: Firefox 설치
  run: sudo apt-get install -y firefox

- name: web-ext + Selenium E2E
  run: pnpm --filter @secretbank/extension e2e:firefox
```

### 참고 자료

- [web-ext CLI 문서](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [geckodriver 릴리즈](https://github.com/mozilla/geckodriver/releases)
- [Firefox Extension Workshop](https://extensionworkshop.com/)
- [WebDriver BiDi (Playwright + Firefox MV3 로드맵)](https://bugzilla.mozilla.org/show_bug.cgi?id=1812681)

### MV3 전환 시

Firefox 121+ 에서 MV3 정식 지원이 완료되면:
1. `wxt.config.ts` 에서 firefox 타겟 MV3 활성화
2. `manifest-validation.test.ts` 의 `manifest_version` 기대값을 `3` 으로 변경
3. `browser_action` → `action` 필드 검증으로 업데이트
4. Playwright Firefox 로 Chromium 과 동일 E2E 시나리오 재사용 가능
