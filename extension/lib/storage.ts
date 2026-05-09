/**
 * @file storage.ts
 * @license AGPL-3.0-or-later
 *
 * chrome.storage.local 의 typed wrapper.
 *
 * 저장 데이터:
 *   - `pairing`: Extension ↔ Desktop 페어링 정보
 *
 * ⚠️  보안 한계 (위협 모델 T7):
 *   extensionPriv(X25519 개인키)는 chrome.storage.local 에 base64 평문으로 저장됨.
 *   브라우저 확장 권한 침해(악의적인 다른 확장, 로컬 디버거 접근) 시 노출 가능.
 *   chrome.storage.local 은 브라우저 프로파일 디렉토리에 SQLite 로 기록되며
 *   OS 수준 암호화(BitLocker/FileVault)에 의존한다.
 *   완화: 개인키는 페어링 1회용 ephemeral — 재페어링 시 새 키 생성.
 *   참조: docs/task_m24e.md 위협 모델 T7.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema — 저장 구조 정의
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 에 저장되는 페어링 정보 schema.
 *
 * extensionPriv: Extension 측 X25519 개인키 (base64, 32바이트).
 *   ※ chrome.storage.local 에 평문 저장됨 — 위협 모델 T7 참조.
 * desktopPub: Desktop 측 X25519 공개키 (base64, 32바이트).
 * deviceId: Desktop 디바이스 식별자.
 * pairedAt: 페어링 완료 시각 (Unix ms).
 */
export const PairingStorageSchema = z.object({
  extensionPriv: z.string().min(1),
  desktopPub: z.string().min(1),
  deviceId: z.string().min(1),
  pairedAt: z.number().int().positive(),
});

/** 페어링 저장 구조 타입 */
export type PairingStorage = z.infer<typeof PairingStorageSchema>;

// ---------------------------------------------------------------------------
// chrome.storage.local 키
// ---------------------------------------------------------------------------

const PAIRING_KEY = "pairing";

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 에서 페어링 정보를 읽어온다.
 *
 * @returns PairingStorage 또는 null (저장 데이터 없거나 스키마 불일치)
 */
export async function getPairing(): Promise<PairingStorage | null> {
  const result = await chrome.storage.local.get(PAIRING_KEY);
  const raw = result[PAIRING_KEY];
  if (raw === undefined || raw === null) return null;

  // Zod 검증 — 구조 불일치 시 null 반환 (조용한 실패)
  const parsed = PairingStorageSchema.safeParse(raw);
  if (!parsed.success) return null;

  return parsed.data;
}

/**
 * chrome.storage.local 에 페어링 정보를 저장한다.
 *
 * ⚠️  extensionPriv 는 평문으로 저장됨 — 위협 모델 T7 참조.
 *
 * @param data PairingStorage 객체
 */
export async function setPairing(data: PairingStorage): Promise<void> {
  await chrome.storage.local.set({ [PAIRING_KEY]: data });
}

/**
 * chrome.storage.local 에서 페어링 정보를 삭제한다.
 * 재페어링 또는 페어링 초기화 시 호출한다.
 */
export async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(PAIRING_KEY);
}
