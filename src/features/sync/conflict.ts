/**
 * conflict — M9 Phase G T095 (resolver 정책).
 *
 * Yjs CRDT 의 native 동작은 last-write-wins (timestamp 기반). 이 정책으로는
 * 보안 invariant 가 깨지는 케이스 하나가 있다:
 *
 *   디바이스 A 가 credential 을 revoke (status='revoked') →
 *   디바이스 B 가 동기화 전에 같은 credential 의 다른 필드를 수정
 *   (status='active' 라고 추정한 채 update). B 의 set 이 timestamp 가 더
 *   크면 LWW 에 의해 active 가 이김. → 보안 사고.
 *
 * 해결: status 의 우선순위를 명시. revoked / compromised 는 active 보다
 * 강함. observer 가 받은 변경을 적용 전에 priority 비교 — 더 약한 status
 * 로의 자동 downgrade 차단.
 */

import type { CredentialStatus } from "../inventory/types";

const STATUS_PRIORITY: Record<CredentialStatus, number> = {
  active: 0,
  compromised: 2,
  revoked: 3,
};

/**
 * 두 status 중 우선순위가 높은 것을 반환. 같은 우선순위면 incoming 채택.
 */
export function resolveStatusConflict(
  current: CredentialStatus | undefined,
  incoming: CredentialStatus,
): CredentialStatus {
  if (!current) return incoming;
  const cp = STATUS_PRIORITY[current] ?? 0;
  const ip = STATUS_PRIORITY[incoming] ?? 0;
  return ip >= cp ? incoming : current;
}

/**
 * 일반 record 형식의 row 에 conflict 정책을 적용. credential row 의 status
 * 만 강제 비교 — 다른 필드는 LWW 그대로.
 *
 * 호출자: Phase E-5 의 round-trip 흐름에서 remote update 적용 직전.
 */
export function reconcileCredentialRow<T extends Record<string, unknown>>(
  current: T | undefined,
  incoming: T,
): T {
  const curStatus = current?.["status"] as CredentialStatus | undefined;
  const inStatus = incoming["status"] as CredentialStatus | undefined;
  if (!inStatus) return incoming;
  const winner = resolveStatusConflict(curStatus, inStatus);
  if (winner === inStatus) return incoming;
  // current 의 status 가 더 강함 — 다른 필드는 incoming 채택하되 status 만 보존.
  return { ...incoming, status: winner };
}
