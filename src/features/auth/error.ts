/**
 * Tauri 의 AuthCommandError 는 `#[serde(tag = "code")]` 로 serialize 되어
 * frontend 에 plain object 로 전달된다 (예: `{code:"relay",status:500,body:"..."}`).
 * `String(err)` 직접 호출 시 `[object Object]` 가 표시되므로 본 헬퍼로 변환.
 */

interface AuthErrorShape {
  code?: string;
  message?: string;
  status?: number;
  body?: string;
  field?: string;
  provider?: string;
}

export function stringifyAuthError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as AuthErrorShape;
    if (e.code === "relay" && (e.status || e.body)) {
      return `relay ${e.status ?? "?"}: ${e.body ?? "(no body)"}`;
    }
    if (e.code === "network" && e.message) return `network: ${e.message}`;
    if (e.code === "internal" && e.message) return `internal: ${e.message}`;
    if (e.code === "unsupported_provider" && e.provider) {
      return `unsupported provider: ${e.provider}`;
    }
    if (e.code === "missing_field" && e.field) return `missing field: ${e.field}`;
    if (e.code === "vault_locked") return "vault is locked";
    if (e.code === "empty_email") return "email is required";
    if (e.code === "no_session") return "no signed-in session";
    if (e.message) return e.message;
    try {
      return JSON.stringify(err);
    } catch {
      return "unknown error";
    }
  }
  return String(err);
}
