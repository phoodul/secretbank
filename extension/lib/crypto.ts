/**
 * @file crypto.ts
 * @license AGPL-3.0-or-later
 *
 * B-4: Extension 측 암호화 primitives wrapper.
 *
 * 사용 라이브러리:
 *   - X25519 ECDH: @noble/curves/ed25519 (x25519 네임스페이스)
 *   - XChaCha20-Poly1305: @noble/ciphers/chacha
 *
 * 두 라이브러리 모두 Paul Miller(paulmillr) 가 작성한 audited 라이브러리.
 * MIT 라이선스 — AGPL-3.0-or-later 와 호환.
 *
 * 보안 요구사항:
 *   - private key 는 Uint8Array 로만 다루며 string 변환 금지
 *   - nonce 는 항상 crypto.getRandomValues() 로 생성
 *   - constant-time 비교에는 timingSafeEqual 헬퍼 사용
 *
 * Web Crypto API X25519 지원 상태 (2026-05):
 *   - Chrome 133+: X25519 deriveBits 지원 (단, 일부 환경 미지원)
 *   - Firefox 130+: 지원
 *   - Safari: 미지원
 *   - 일관성 위해 @noble/curves 로 통일 (Web Crypto fallback 불필요)
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";

// ---------------------------------------------------------------------------
// X25519 keypair
// ---------------------------------------------------------------------------

/** X25519 keypair. privateKey 는 노출 금지 — 로그/직렬화에 포함하지 마라. */
export interface X25519Keypair {
  /** 32바이트 private key (절대 직렬화/로깅 금지) */
  privateKey: Uint8Array;
  /** 32바이트 public key (base64 로 상대방에게 전달) */
  publicKey: Uint8Array;
}

/**
 * X25519 keypair 생성.
 *
 * noble-curves 는 crypto.getRandomValues() 기반 CSPRNG 를 사용한다.
 * private key 는 Uint8Array 로만 다루며 string 변환을 하지 않는다.
 */
export function generateX25519Keypair(): X25519Keypair {
  // @noble/curves 2.x: randomSecretKey() 가 CSPRNG 기반 32바이트 private key 생성
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * X25519 ECDH — 자신의 private key 와 상대방의 public key 로 shared secret 파생.
 *
 * @param myPrivateKey 자신의 X25519 private key (32바이트)
 * @param theirPublicKey 상대방의 X25519 public key (32바이트)
 * @returns 32바이트 shared secret (HKDF 등으로 추가 파생 필요)
 */
export function x25519Dh(myPrivateKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(myPrivateKey, theirPublicKey);
}

// ---------------------------------------------------------------------------
// XChaCha20-Poly1305
// ---------------------------------------------------------------------------

/** XChaCha20-Poly1305 nonce 길이: 24바이트 */
export const XCHACHA_NONCE_BYTES = 24;

/** XChaCha20-Poly1305 key 길이: 32바이트 */
export const XCHACHA_KEY_BYTES = 32;

/** XChaCha20-Poly1305 tag 길이: 16바이트 */
export const XCHACHA_TAG_BYTES = 16;

/**
 * 24바이트 랜덤 nonce 생성.
 * crypto.getRandomValues() 기반 CSPRNG 사용.
 */
export function generateXNonce(): Uint8Array {
  return randomBytes(XCHACHA_NONCE_BYTES);
}

/**
 * XChaCha20-Poly1305 암호화.
 *
 * 반환 형식: `[nonce(24) || ciphertext+tag]`
 * 이 형식은 Rust 측 `secretbank_crypto::aead::encrypt` 와 동일하다.
 *
 * @param key 32바이트 암호화 키 (SecretBox 등가 — 직접 노출 금지)
 * @param plaintext 평문
 * @param aad Additional Authenticated Data (optional, 기본 빈 바이트)
 * @returns nonce+ciphertext+tag 결합 Uint8Array
 */
export function xchaEncrypt(key: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  const nonce = generateXNonce();
  const cipher = xchacha20poly1305(key, nonce, aad);
  const ct = cipher.encrypt(plaintext);
  // envelope = nonce(24) + ct+tag
  const envelope = new Uint8Array(XCHACHA_NONCE_BYTES + ct.byteLength);
  envelope.set(nonce, 0);
  envelope.set(ct, XCHACHA_NONCE_BYTES);
  return envelope;
}

/**
 * XChaCha20-Poly1305 복호화.
 *
 * 입력 형식: `[nonce(24) || ciphertext+tag]` — Rust 측 envelope 과 동일.
 *
 * @param key 32바이트 암호화 키
 * @param envelope nonce+ciphertext+tag
 * @param aad Additional Authenticated Data (암호화 시와 동일해야 함)
 * @returns 복호화된 평문
 * @throws Error AAD 불일치 또는 tamper 감지 시
 */
export function xchaDecrypt(key: Uint8Array, envelope: Uint8Array, aad?: Uint8Array): Uint8Array {
  if (envelope.byteLength < XCHACHA_NONCE_BYTES + XCHACHA_TAG_BYTES) {
    throw new Error(
      `XChaCha20 envelope 너무 짧음: ${envelope.byteLength} < ${XCHACHA_NONCE_BYTES + XCHACHA_TAG_BYTES}`,
    );
  }
  const nonce = envelope.slice(0, XCHACHA_NONCE_BYTES);
  const ct = envelope.slice(XCHACHA_NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce, aad);
  return cipher.decrypt(ct);
}

// ---------------------------------------------------------------------------
// base64 변환 헬퍼
// ---------------------------------------------------------------------------

/**
 * Uint8Array → base64 문자열 (표준 base64, URL-safe 아님).
 * X25519 공개키를 NM 메시지에 포함할 때 사용.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * base64 문자열 → Uint8Array.
 * NM 메시지에서 수신한 공개키를 파싱할 때 사용.
 */
export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// constant-time 비교
// ---------------------------------------------------------------------------

/**
 * 두 Uint8Array 를 constant-time 으로 비교한다.
 * timing attack 방어 — 조기 반환 없음.
 *
 * 길이가 다르면 false (단, 길이 비교 자체는 timing-safe 하지 않음 —
 * 공개 도메인에서는 허용 가능).
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
