import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";

/**
 * 클라이언트 인증 미들웨어 — stub 구현.
 *
 * SECURITY NOTE: 이 구현은 Bearer 토큰의 존재 여부만 확인하는 placeholder 다.
 * 실제 JWT 서명 검증 및 claims(sub, exp, iss) 확인은 T086 (M8) 에서 구현된다.
 * Production 환경에서는 이 코드를 그대로 사용하지 말 것.
 *
 * TODO(T086 M8): verify JWT signature + claims (sub, exp, iss).
 */
export const requireUserAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { userId: string };
}> = async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing_auth" }, 401);
  }
  const token = auth.slice(7);
  if (!token) {
    return c.json({ error: "empty_token" }, 401);
  }
  // TODO(T086 M8): verify JWT signature + claims (sub, exp, iss).
  c.set("userId", token);
  await next();
};
