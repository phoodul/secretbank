// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/domain-match.ts — M24-E Phase C-4
//
// issuer 도메인 매칭 — phishing 방어 (T4 위협 모델).
// subdomain-safe: `accounts.google.com` 의 issuer = `google.com` 일 때 매칭 OK,
//                 `g00gle.com` (homograph) / `googel.com` (typo) 는 매칭 ❌.
//
// 데스크톱 의 issuer 모델이 root host 만 저장한다고 가정 (예: `google.com`).
// 우리는 페이지 host 가 issuer host 의 subdomain 인지 확인.

/**
 * 페이지 host 가 issuer host 의 subdomain 인지 (정확 매치 또는 `*.issuer`).
 *
 * 규칙:
 *   1. 정확 일치 — `google.com` === `google.com`
 *   2. subdomain — `accounts.google.com` 의 끝에 `.google.com`
 *   3. 다른 모든 경우 false (homograph / typo / cross-TLD 모두 ❌)
 *
 * 입력은 normalize 후 비교 (소문자 + 마침표 끝 제거 + Punycode 그대로).
 *
 * IDN homograph 방어:
 *   - `xn--g00gle-...` 같은 punycode 가 issuer 와 정확히 같지 않으면 거부
 *   - 비교는 ASCII (Punycode 형태) 로 만 — 사람 눈에 보이는 유니코드 ❌
 */
export function matchesIssuer(pageHost: string, issuerHost: string): boolean {
  const page = normalizeHost(pageHost);
  const issuer = normalizeHost(issuerHost);

  if (!page || !issuer) return false;

  if (page === issuer) return true;
  // suffix match — 반드시 `.issuer` 로 끝나야 (그냥 `issuer` 로 끝나는 건 ❌, e.g. `evilgoogle.com`).
  if (page.endsWith("." + issuer)) return true;
  return false;
}

function normalizeHost(host: string): string {
  if (!host) return "";
  return host.toLowerCase().replace(/\.+$/, "").trim();
}

/**
 * URL string 에서 host 추출. invalid 시 null.
 * 보안: HTTPS scheme 만 허용 (HTTP autofill 거부).
 */
export function hostFromHttpsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return normalizeHost(u.hostname);
  } catch {
    return null;
  }
}
