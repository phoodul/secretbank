// Vitest 테스트 셋업 — extension/ 전용
import "@testing-library/jest-dom";

// ── chrome / browser API mock (WXT 빌드 없는 Vitest 환경) ───────────────────
//
// @wxt-dev/browser 는 다음 우선순위로 browser 객체를 선택한다:
//   1. globalThis.browser?.runtime?.id 가 있으면 browser 사용
//   2. 없으면 globalThis.chrome 사용
//
// @wxt-dev/i18n의 t() 는 browser.i18n.getMessage 를 호출한다.
// Vitest (jsdom) 에는 WebExtension API 가 없으므로 chrome 을 mock 으로 주입.
// 키 이름을 그대로 반환 — 테스트에서 번역 문자열 대신 키 이름을 검증한다.

// @ts-ignore — global chrome 주입 (WebExtension polyfill)
globalThis.chrome = {
  i18n: {
    // 키 이름을 그대로 반환 (번역 없음)
    getMessage: (key: string) => key,
    getUILanguage: () => "en",
  },
  storage: {
    local: {
      get: async (_keys: string | string[] | Record<string, unknown>) =>
        ({}) as Record<string, unknown>,
      set: async (_items: Record<string, unknown>) => {},
      remove: async (_keys: string | string[]) => {},
      clear: async () => {},
    },
  },
  runtime: {
    id: undefined, // runtime.id 없음 → @wxt-dev/browser 가 chrome 을 선택하도록
    // lastError 는 각 테스트에서 직접 세팅한다 (기본 null)
    lastError: undefined as chrome.runtime.LastError | undefined,
    // connectNative 기본 stub — 각 테스트에서 vi.spyOn / mockImplementation 으로 교체
    connectNative: (_hostId: string): chrome.runtime.Port => {
      // 기본 구현: 빈 Port stub 반환 (즉시 연결 성공 시뮬레이션)
      const listeners = {
        onMessage: [] as Array<(msg: unknown) => void>,
        onDisconnect: [] as Array<() => void>,
      };
      return {
        name: _hostId,
        postMessage: () => {},
        disconnect: () => {},
        onMessage: {
          addListener: (cb: (msg: unknown) => void) => listeners.onMessage.push(cb),
          removeListener: (cb: (msg: unknown) => void) => {
            const idx = listeners.onMessage.indexOf(cb);
            if (idx !== -1) listeners.onMessage.splice(idx, 1);
          },
          hasListener: (cb: (msg: unknown) => void) => listeners.onMessage.includes(cb),
        },
        onDisconnect: {
          addListener: (cb: () => void) => listeners.onDisconnect.push(cb),
          removeListener: (cb: () => void) => {
            const idx = listeners.onDisconnect.indexOf(cb);
            if (idx !== -1) listeners.onDisconnect.splice(idx, 1);
          },
          hasListener: (cb: () => void) => listeners.onDisconnect.includes(cb),
        },
      } as unknown as chrome.runtime.Port;
    },
  },
};

// ── window.matchMedia mock (jsdom 미지원) ─────────────────────────────────────
// ThemeProvider 의 prefers-color-scheme 감지에 필요.
// 기본값: light 모드 (matches = false).
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, // 기본 light 모드
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
