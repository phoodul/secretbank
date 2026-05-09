import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDeepLink } from "../deep-link";

describe("handleDeepLink — URL 파싱 + navigate 호출 검증", () => {
  let navigate: (path: string) => void;

  beforeEach(() => {
    navigate = vi.fn<(path: string) => void>();
  });

  // ------------------------------------------------------------------ happy path
  it("secretbank://graph?credential=<id> → /graph?focus=<id> navigate", () => {
    handleDeepLink("secretbank://graph?credential=01HZ5X9ABCDEF01234567890AB", navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/graph?focus=01HZ5X9ABCDEF01234567890AB");
  });

  it("credential 없는 secretbank://graph → /graph navigate", () => {
    handleDeepLink("secretbank://graph", navigate);
    expect(navigate).toHaveBeenCalledWith("/graph");
  });

  it("소문자 hex credential id → navigate 허용", () => {
    handleDeepLink("secretbank://graph?credential=abc123", navigate);
    expect(navigate).toHaveBeenCalledWith("/graph?focus=abc123");
  });

  // ------------------------------------------------------------------ security: reject cases
  it("잘못된 scheme (https://) → navigate 미호출", () => {
    handleDeepLink("https://evil.com/graph?credential=abc", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("허용되지 않은 경로 (secretbank://settings) → navigate 미호출", () => {
    handleDeepLink("secretbank://settings?credential=abc", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("credential id 에 특수문자 포함 → navigate 미호출", () => {
    handleDeepLink("secretbank://graph?credential=../../../etc/passwd", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("credential id 가 공백 → navigate 미호출", () => {
    handleDeepLink("secretbank://graph?credential=", navigate);
    // 빈 string 은 CREDENTIAL_ID_RE 불일치
    // → credential='' 이면 null 이 아니라 '' — whitelist 실패
    expect(navigate).not.toHaveBeenCalled();
  });

  it("유효하지 않은 URL → navigate 미호출", () => {
    handleDeepLink("not a url at all", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("credential id 가 130자 초과 → navigate 미호출", () => {
    const longId = "A".repeat(129);
    handleDeepLink(`secretbank://graph?credential=${longId}`, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("credential id 가 정확히 128자 → navigate 허용", () => {
    const maxId = "A".repeat(128);
    handleDeepLink(`secretbank://graph?credential=${maxId}`, navigate);
    expect(navigate).toHaveBeenCalledWith(`/graph?focus=${maxId}`);
  });
});

// ------------------------------------------------------------------ G-3-2: blast_credential
describe("handleDeepLink — G-3-2 blast_credential 화이트리스트", () => {
  let navigate: (path: string) => void;

  beforeEach(() => {
    navigate = vi.fn<(path: string) => void>();
  });

  it("secretbank://graph?blast_credential=<id> → /graph?blast_focus=<id>", () => {
    handleDeepLink("secretbank://graph?blast_credential=01JWBLASTCRED000001", navigate);
    expect(navigate).toHaveBeenCalledWith("/graph?blast_focus=01JWBLASTCRED000001");
  });

  it("소문자 hex blast_credential id → navigate 허용", () => {
    handleDeepLink("secretbank://graph?blast_credential=abc123", navigate);
    expect(navigate).toHaveBeenCalledWith("/graph?blast_focus=abc123");
  });

  it("blast_credential id 가 빈 문자열 → navigate 미호출", () => {
    handleDeepLink("secretbank://graph?blast_credential=", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("blast_credential id 에 특수문자 포함 → navigate 미호출", () => {
    handleDeepLink("secretbank://graph?blast_credential=../etc/passwd", navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("blast_credential id 129자 초과 → navigate 미호출", () => {
    const longId = "A".repeat(129);
    handleDeepLink(`secretbank://graph?blast_credential=${longId}`, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("blast_credential id 128자 → navigate 허용", () => {
    const maxId = "A".repeat(128);
    handleDeepLink(`secretbank://graph?blast_credential=${maxId}`, navigate);
    expect(navigate).toHaveBeenCalledWith(`/graph?blast_focus=${maxId}`);
  });

  it("blast_credential 과 credential 동시 존재 → blast_credential 우선", () => {
    handleDeepLink(
      "secretbank://graph?blast_credential=BLAST01&credential=CRED01",
      navigate,
    );
    expect(navigate).toHaveBeenCalledWith("/graph?blast_focus=BLAST01");
    expect(navigate).not.toHaveBeenCalledWith("/graph?focus=CRED01");
  });
});
