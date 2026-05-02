/**
 * M9 Phase E-1 — AEAD adapter 회귀.
 *
 * - round-trip: encrypt 후 decrypt 가 원문 복원
 * - 다른 키로 decrypt → throw
 * - ciphertext 1바이트 tamper → throw (Poly1305 무결성 보장)
 * - nonce 1바이트 tamper → throw
 * - 빈 plaintext (Y.encodeStateAsUpdate 가 빈 doc 일 때) round-trip
 * - AAD mismatch → throw
 * - 키 길이 가드 (32 ≠ key length)
 * - envelope 길이 가드 (nonce + tag 미달)
 * - 두 번 encrypt 시 nonce 가 다름 (random nonce 안전성)
 */
import { describe, expect, it } from "vitest";

import { AEAD_KEY_BYTES, AEAD_NONCE_BYTES, decrypt, encrypt, generateNonce } from "../aead";

function makeKey(byte: number = 0xab): Uint8Array {
  return new Uint8Array(AEAD_KEY_BYTES).fill(byte);
}

describe("AEAD adapter (Phase E-1)", () => {
  it("round-trips a typical Y.Doc-sized payload", () => {
    const key = makeKey(0x01);
    const plaintext = new TextEncoder().encode(
      "y-doc update with a few credential metadata writes",
    );
    const env = encrypt(key, plaintext);

    expect(env.length).toBeGreaterThan(AEAD_NONCE_BYTES + 16);
    const decoded = decrypt(key, env);
    expect(new TextDecoder().decode(decoded)).toBe(
      "y-doc update with a few credential metadata writes",
    );
  });

  it("decrypt with a different key throws (no silent corruption)", () => {
    const env = encrypt(makeKey(0x01), new Uint8Array([1, 2, 3]));
    expect(() => decrypt(makeKey(0x02), env)).toThrow();
  });

  it("ciphertext tamper of one byte throws (Poly1305 integrity)", () => {
    const key = makeKey(0x03);
    const env = encrypt(key, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    // 마지막 byte (Poly1305 tag 영역 또는 ciphertext) 를 1bit flip.
    env[env.length - 1] ^= 0x01;
    expect(() => decrypt(key, env)).toThrow();
  });

  it("nonce tamper throws (different nonce → wrong stream cipher state)", () => {
    const key = makeKey(0x04);
    const env = encrypt(key, new Uint8Array([0x10, 0x20, 0x30]));
    env[0] ^= 0xff; // first byte = nonce[0]
    expect(() => decrypt(key, env)).toThrow();
  });

  it("empty plaintext round-trips (still has nonce + 16-byte tag)", () => {
    const key = makeKey(0x05);
    const env = encrypt(key, new Uint8Array(0));
    expect(env.length).toBe(AEAD_NONCE_BYTES + 16);
    expect(decrypt(key, env).length).toBe(0);
  });

  it("AAD mismatch throws (envelope-level binding)", () => {
    const key = makeKey(0x06);
    const aad1 = new TextEncoder().encode("doc:abc:v1");
    const aad2 = new TextEncoder().encode("doc:abc:v2");
    const env = encrypt(key, new Uint8Array([1, 2, 3]), aad1);
    expect(() => decrypt(key, env, aad2)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    const short = new Uint8Array(31);
    expect(() => encrypt(short, new Uint8Array(0))).toThrow(/32 bytes/);
    const env = encrypt(makeKey(), new Uint8Array(0));
    expect(() => decrypt(short, env)).toThrow(/32 bytes/);
  });

  it("rejects envelopes shorter than nonce + tag minimum", () => {
    expect(() => decrypt(makeKey(), new Uint8Array(AEAD_NONCE_BYTES + 15))).toThrow(/shorter/);
    // exact minimum (24 + 16 = 40) doesn't fail length guard, but content
    // (zeros) fails MAC verification — throws regardless.
    expect(() => decrypt(makeKey(), new Uint8Array(AEAD_NONCE_BYTES + 16))).toThrow();
  });

  it("two encrypt calls produce different nonces (random sampling)", () => {
    const key = makeKey(0x07);
    const a = encrypt(key, new Uint8Array([1]));
    const b = encrypt(key, new Uint8Array([1]));
    // 동일 평문 + 동일 키지만 envelope 가 byte-wise 달라야 함 (nonce + tag).
    expect(a).not.toEqual(b);
    // 그리고 둘 다 정상 복호화됨.
    expect(decrypt(key, a)).toEqual(decrypt(key, b));
  });

  it("generateNonce returns 24 random bytes", () => {
    const n1 = generateNonce();
    const n2 = generateNonce();
    expect(n1.length).toBe(AEAD_NONCE_BYTES);
    expect(n2.length).toBe(AEAD_NONCE_BYTES);
    expect(n1).not.toEqual(n2);
  });
});
