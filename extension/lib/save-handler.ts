// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/save-handler.ts — M24-E Phase D-4
//
// form submit 감지 → nm-host 조회 → 신규/rotation 분기 → SaveBanner 표시.
// T-CRED-1: plaintext password 는 메모리 + NM channel(B-4 암호화)만. console.log/DOM ❌.
// T-SAVE-1: never list 체크 선행 → 이미 등록된 도메인은 banner skip.
// T-SAVE-2: debounce(single-flight) — 빠른 연속 submit 시 마지막 1건만 처리.

import { NMClient } from "./nm-client.js";
import { mountSaveBanner } from "./save-banner-host.js";
import { getSessionToken, getNeverSaveDomains, addNeverSaveDomain } from "./storage.js";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type AutocompleteHint = "new-password" | "current-password" | null;

export interface FormSubmitInput {
  domain: string;
  siteName: string;
  username: string;
  /** T-CRED-1: plaintext — 함수 종료 시 null 처리 필수. */
  password: string;
  autocompleteHint: AutocompleteHint;
}

// ---------------------------------------------------------------------------
// decideSaveKind — 저장 종류 결정 트리
// ---------------------------------------------------------------------------

/**
 * autocomplete hint + 기존 credential 존재 여부로 "new" / "update" 를 결정한다.
 *
 * 결정 트리:
 *   new-password + 기존 없음  → "new"
 *   new-password + 기존 있음  → "update" (rotation)
 *   current-password + 기존 있음 → "update"
 *   current-password + 기존 없음 → "new" (최초 login form 저장)
 *   null + fallback → hasExisting ? "update" : "new"
 */
export function decideSaveKind(
  _domain: string,
  hasExisting: boolean,
  autocompleteHint: AutocompleteHint,
): "new" | "update" {
  if (autocompleteHint === "new-password") {
    return hasExisting ? "update" : "new";
  }
  if (autocompleteHint === "current-password") {
    return hasExisting ? "update" : "new";
  }
  // fallback
  return hasExisting ? "update" : "new";
}

// ---------------------------------------------------------------------------
// never list 헬퍼
// ---------------------------------------------------------------------------

/** 도메인이 never save 목록에 있으면 true. */
export async function isDomainOnNeverList(domain: string): Promise<boolean> {
  const list = await getNeverSaveDomains();
  return list.includes(domain);
}

// ---------------------------------------------------------------------------
// single-flight guard — 빠른 연속 submit 방어 (T-SAVE-2)
// ---------------------------------------------------------------------------

let _inflight = false;

// 테스트에서 reset 가능하도록 export (테스트 전용 — 프로덕션에서는 사용 금지).
export function _resetInflight(): void {
  _inflight = false;
}

// ---------------------------------------------------------------------------
// handleFormSubmit — 메인 진입점
// ---------------------------------------------------------------------------

/**
 * form submit 이벤트 처리 메인 함수.
 *
 * 흐름:
 *   1. never list 체크 → skip
 *   2. single-flight guard (T-SAVE-2)
 *   3. session token 조회 → 없으면 skip (미페어링/만료)
 *   4. nm-host → credential_list_by_domain → hasExisting 결정
 *   5. decideSaveKind 호출
 *   6. SaveBanner 마운트
 *   7. 사용자 액션 처리 (onSave/onNever/onDismiss)
 *   8. T-CRED-1: password null 처리
 */
export async function handleFormSubmit(input: FormSubmitInput, client: NMClient): Promise<void> {
  // T-SAVE-1: never list 먼저 확인
  if (await isDomainOnNeverList(input.domain)) return;

  // T-SAVE-2: single-flight guard
  if (_inflight) return;
  _inflight = true;

  try {
    // session token 없으면 banner skip (미페어링 또는 만료 — 인증 없이 저장 ❌)
    const session = await getSessionToken();
    if (!session) return;

    // nm-host 에서 도메인 기존 credential 조회
    let hasExisting = false;
    let existingCredentialId: string | undefined;
    try {
      const listResp = await client.credentialListByDomain(input.domain, session.token);
      hasExisting = listResp.exists;
      existingCredentialId = listResp.credential_id;
    } catch {
      // nm-host 응답 실패 시 fallback: 신규로 간주 (보수적)
      hasExisting = false;
    }

    const kind = decideSaveKind(input.domain, hasExisting, input.autocompleteHint);

    // banner 마운트 — unmount 핸들 유지
    let unmount: (() => void) | null = null;

    const onSave = async () => {
      if (unmount) {
        unmount();
        unmount = null;
      }
      try {
        const tok = await getSessionToken();
        if (!tok) return;

        if (kind === "new") {
          await client.credentialCreate(
            {
              domain: input.domain,
              username: input.username,
              password: input.password,
              site_name: input.siteName,
            },
            tok.token,
          );
        } else {
          // update — existingCredentialId 없으면 fallback create
          if (existingCredentialId) {
            await client.credentialUpdate(
              {
                credential_id: existingCredentialId,
                username: input.username,
                password: input.password,
              },
              tok.token,
            );
          } else {
            await client.credentialCreate(
              {
                domain: input.domain,
                username: input.username,
                password: input.password,
                site_name: input.siteName,
              },
              tok.token,
            );
          }
        }
      } catch {
        // 저장 실패 — 무음 처리 (배너는 이미 닫힘)
      }
    };

    const onNever = async () => {
      if (unmount) {
        unmount();
        unmount = null;
      }
      await addNeverSaveDomain(input.domain);
    };

    const onDismiss = () => {
      if (unmount) {
        unmount();
        unmount = null;
      }
    };

    unmount = mountSaveBanner({
      kind,
      siteName: input.siteName,
      onSave,
      onNever,
      onDismiss,
    });
  } finally {
    // T-CRED-1: password plaintext 메모리 잔류 최소화 — 참조 해제
    // JS 는 GC 기반이므로 완전한 제거 보장은 불가하나, 참조 제거로 GC 기회 부여.
    (input as unknown as Record<string, unknown>).password = null;
    _inflight = false;
  }
}
