/**
 * useDeepLink — secretbank:// deep-link 핸들러 훅
 *
 * Rust backend(lib.rs)가 tauri-plugin-deep-link 의 on_open_url 콜백에서
 * "deep-link" 이벤트를 emit 한다. 이 훅은 해당 이벤트를 구독하고
 * secretbank://graph?credential=<id> URL 수신 시 React Router 로
 * /graph?focus=<id> 에 navigate 한다.
 *
 * 보안: credential query 파라미터만 허용한다. 임의 경로는 무시한다.
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

/** 허용된 deep-link 경로 */
const ALLOWED_PATHS = new Set(["graph", "incidents"]);

/** credential id 허용 패턴 — ULID (26자, [0-9A-Z]) */
const CREDENTIAL_ID_RE = /^[0-9A-Za-z]{1,128}$/;

/** host 허용 패턴 — 도메인 레이블 + 점 조합 (최대 253자) */
const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * secretbank:// deep-link 이벤트를 구독한다.
 * BrowserRouter 내부 또는 라우터 컨텍스트가 있는 컴포넌트에서 호출해야 한다.
 */
export function useDeepLink(): void {
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string[]>("deep-link", (event) => {
      const urls = event.payload;
      for (const raw of urls) {
        handleDeepLink(raw, navigate);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.warn("[deep-link] listen failed:", err);
      });

    return () => {
      unlisten?.();
    };
  }, [navigate]);
}

/**
 * deep-link URL 을 파싱하고 허용된 경우에만 navigate 한다.
 * @internal — export for unit testing
 */
export function handleDeepLink(
  raw: string,
  navigate: (path: string) => void,
): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    console.warn("[deep-link] invalid URL:", raw);
    return;
  }

  // scheme 검증
  if (url.protocol !== "secretbank:") {
    console.warn("[deep-link] unexpected scheme:", url.protocol);
    return;
  }

  // pathname 추출 — URL 파싱 시 host 가 pathname 처음에 붙는 경우 처리
  // secretbank://graph?... → host="graph", pathname="/"
  // secretbank:///graph?... → host="", pathname="/graph"
  const segment = url.host || url.pathname.replace(/^\//, "");

  if (!ALLOWED_PATHS.has(segment)) {
    console.warn("[deep-link] disallowed path:", segment);
    return;
  }

  if (segment === "graph") {
    const credentialId = url.searchParams.get("credential");
    if (credentialId === null) {
      // focus 없이 그래프 페이지로 이동 (credential 파라미터 자체가 없는 경우)
      navigate("/graph");
      return;
    }
    // 빈 문자열이거나 whitelist 형식 불일치 → 거부
    if (!credentialId || !CREDENTIAL_ID_RE.test(credentialId)) {
      console.warn("[deep-link] invalid credential id:", credentialId);
      return;
    }
    navigate(`/graph?focus=${encodeURIComponent(credentialId)}`);
  }

  if (segment === "incidents") {
    const host = url.searchParams.get("host");
    if (host === null) {
      // host 없이 incidents 페이지로 이동 (전체 목록)
      navigate("/incidents");
      return;
    }
    // host 형식 검증 — 경로 주입 방지
    if (!host || host.length > 253 || !HOST_RE.test(host)) {
      console.warn("[deep-link] invalid host:", host);
      return;
    }
    navigate(`/incidents?host=${encodeURIComponent(host)}`);
  }
}
