/**
 * M9 Phase E-1 — AEAD adapter for end-to-end encrypted sync payloads.
 *
 * Algorithm: **XChaCha20-Poly1305** (`@noble/ciphers`, MIT, audited by Cure53).
 *   - Key:   32 bytes (Phase B-3 의 `sync_get_root_key` 또는 그 HKDF 서브키)
 *   - Nonce: 24 bytes (XChaCha20 의 extended nonce — random sampling 안전)
 *   - Tag:   16 bytes (Poly1305 MAC, 자동 prepend by xchacha20poly1305)
 *
 * **왜 XChaCha20-Poly1305 인가**:
 *   - 24-byte nonce = random sampling 충돌 확률 사실상 0 (vs ChaCha20-Poly1305
 *     의 12-byte nonce — 2^32 메시지 한계).
 *   - Phase F 의 value channel 도 같은 어댑터 재사용 (key 만 다름).
 *   - libsodium 의 `crypto_aead_xchacha20poly1305_ietf` 와 wire-호환 — 미래에
 *     C/Swift 클라이언트가 합류해도 문제 없음.
 *
 * **메시지 포맷**: `[ nonce(24) || ciphertext+tag ]` 단일 버퍼로 직렬화.
 * 수신측은 처음 24바이트를 nonce 로 분리, 나머지를 decrypt 입력으로 사용.
 *
 * **무결성**: Poly1305 tag 가 ciphertext 에 묶여 검증되므로 1바이트만
 * 변조해도 decrypt 가 throw — 회귀에서 확인.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";

export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 24;

/**
 * 새 random nonce 생성 (24 bytes). XChaCha20 의 extended nonce 라
 * `crypto.getRandomValues` 한 번만 호출하면 charge-free.
 */
export function generateNonce(): Uint8Array {
  return randomBytes(AEAD_NONCE_BYTES);
}

/**
 * 32-byte key + 평문 → `[nonce(24) || ciphertext+tag]` 단일 Uint8Array.
 *
 * AAD (associated data) 는 옵션 — Phase F/G 의 envelope metadata 에 사용
 * (예: doc_id 를 AAD 로 묶어 cross-doc replay 방지). 미설정 시 빈 buffer.
 */
export function encrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (key.length !== AEAD_KEY_BYTES) {
    throw new Error(`AEAD key must be ${AEAD_KEY_BYTES} bytes, got ${key.length}`);
  }
  const nonce = generateNonce();
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ct = cipher.encrypt(plaintext);

  const out = new Uint8Array(AEAD_NONCE_BYTES + ct.length);
  out.set(nonce, 0);
  out.set(ct, AEAD_NONCE_BYTES);
  return out;
}

/**
 * `[nonce(24) || ciphertext+tag]` → 평문 Uint8Array.
 *
 * 변조된 메시지 / 잘못된 키 / 잘못된 AAD 면 throw — 호출자는 try/catch
 * 로 보호하고 invalid_payload 같은 사용자 친화 에러로 surface 한다.
 */
export function decrypt(key: Uint8Array, envelope: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (key.length !== AEAD_KEY_BYTES) {
    throw new Error(`AEAD key must be ${AEAD_KEY_BYTES} bytes, got ${key.length}`);
  }
  if (envelope.length < AEAD_NONCE_BYTES + 16) {
    // 24 bytes nonce + 최소 16 bytes Poly1305 tag — 아예 못 미치면 즉시 실패.
    throw new Error("AEAD envelope shorter than nonce + tag minimum");
  }
  const nonce = envelope.subarray(0, AEAD_NONCE_BYTES);
  const ct = envelope.subarray(AEAD_NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ct);
}
