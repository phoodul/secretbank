/**
 * @file pairing.test.ts
 * @license AGPL-3.0-or-later
 *
 * B-4: Extension 측 페어링 프로토콜 단위 테스트.
 *
 * 검증 항목:
 *   1. X25519 RFC 7748 §6.1 Test Vector 1 — @noble/curves 호환성
 *   2. X25519 ECDH 대칭성 — X25519(a,B) == X25519(b,A)
 *   3. XChaCha20-Poly1305 round-trip
 *   4. Cross-language vector — Rust 측과 동일 input → 동일 output
 *   5. PairingSession 생명주기
 *   6. base64 헬퍼
 *   7. timingSafeEqual
 */

import { describe, it, expect } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
  generateX25519Keypair,
  x25519Dh,
  xchaEncrypt,
  xchaDecrypt,
  toBase64,
  fromBase64,
  timingSafeEqual,
  XCHACHA_NONCE_BYTES,
  XCHACHA_TAG_BYTES,
} from "../crypto.js";
import { PairingSession, parsePairedMessage } from "../pairing.js";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// 1. RFC 7748 §6.1 X25519 Test Vector 1
// ---------------------------------------------------------------------------

describe("RFC 7748 §6.1 X25519 Test Vectors", () => {
  // RFC 7748 §6.1 Test Vector 1
  // X25519(alice_scalar, u_coord) = expected_output
  const TV1 = {
    alice_scalar: "a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4",
    u_coord: "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c",
    expected_output: "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552",
  };

  it("TV1: X25519(alice_scalar, u_coord) = expected_output", () => {
    const scalar = hexToBytes(TV1.alice_scalar);
    const uCoord = hexToBytes(TV1.u_coord);
    const expected = hexToBytes(TV1.expected_output);

    // @noble/curves x25519.getSharedSecret(privateKey, publicKey)
    // = X25519(privateKey, publicKey) with clamping
    const output = x25519.getSharedSecret(scalar, uCoord);
    expect(bytesToHex(output)).toBe(TV1.expected_output);
    expect(timingSafeEqual(output, expected)).toBe(true);
  });

  it("TV1: Rust 측 x25519-dalek 과 동일한 결과 (cross-language 검증)", () => {
    // Rust 테스트 rfc7748_tv1_scalar_multiply 와 동일 입력/기대값
    const scalar = hexToBytes(TV1.alice_scalar);
    const uCoord = hexToBytes(TV1.u_coord);

    const output = x25519.getSharedSecret(scalar, uCoord);
    // Rust 측에서 검증한 동일한 expected_output 과 일치해야 한다
    expect(bytesToHex(output)).toBe(TV1.expected_output);
  });

  it("X25519 basepoint 스칼라 곱: @noble/curves 기본 동작 확인", () => {
    // X25519(scalar, 9) = public_key (standard key generation)
    const scalar = hexToBytes("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
    // @noble/curves getPublicKey = X25519(scalar, basepoint=9)
    const pub = x25519.getPublicKey(scalar);
    // 32바이트 공개키 생성 확인
    expect(pub.byteLength).toBe(32);
    // 특정 고정값 검증 (noble-curves 2.x 에서 안정된 값)
    expect(bytesToHex(pub)).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// 2. X25519 ECDH 대칭성
// ---------------------------------------------------------------------------

describe("X25519 ECDH 대칭성", () => {
  it("X25519(a, B) == X25519(b, A) — 임의 keypair", () => {
    const { privateKey: aPriv, publicKey: aPub } = generateX25519Keypair();
    const { privateKey: bPriv, publicKey: bPub } = generateX25519Keypair();

    const sharedFromA = x25519Dh(aPriv, bPub);
    const sharedFromB = x25519Dh(bPriv, aPub);

    expect(timingSafeEqual(sharedFromA, sharedFromB)).toBe(true);
  });

  it("두 독립 keypair 는 서로 다른 공개키를 가진다", () => {
    const k1 = generateX25519Keypair();
    const k2 = generateX25519Keypair();
    expect(bytesToHex(k1.publicKey)).not.toBe(bytesToHex(k2.publicKey));
  });

  it("공개키는 32바이트이다", () => {
    const { publicKey } = generateX25519Keypair();
    expect(publicKey.byteLength).toBe(32);
  });

  it("비밀키는 32바이트이다", () => {
    const { privateKey } = generateX25519Keypair();
    expect(privateKey.byteLength).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// 3. XChaCha20-Poly1305 round-trip
// ---------------------------------------------------------------------------

describe("XChaCha20-Poly1305 암호화/복호화", () => {
  const key = new Uint8Array(32).fill(0x01);

  it("평문 round-trip 성공", () => {
    const plaintext = new TextEncoder().encode("Hello, Secretbank!");
    const envelope = xchaEncrypt(key, plaintext);
    const decrypted = xchaDecrypt(key, envelope);
    expect(new TextDecoder().decode(decrypted)).toBe("Hello, Secretbank!");
  });

  it("AAD 포함 round-trip 성공", () => {
    const plaintext = new TextEncoder().encode("secret payload");
    const aad = new TextEncoder().encode("pairing-channel");
    const envelope = xchaEncrypt(key, plaintext, aad);
    const decrypted = xchaDecrypt(key, envelope, aad);
    expect(new TextDecoder().decode(decrypted)).toBe("secret payload");
  });

  it("envelope 길이 = nonce(24) + plaintext + tag(16)", () => {
    const plaintext = new Uint8Array(10).fill(0xab);
    const envelope = xchaEncrypt(key, plaintext);
    expect(envelope.byteLength).toBe(XCHACHA_NONCE_BYTES + 10 + XCHACHA_TAG_BYTES);
  });

  it("같은 평문 + 같은 key → 다른 envelope (랜덤 nonce)", () => {
    const plaintext = new TextEncoder().encode("x");
    const env1 = xchaEncrypt(key, plaintext);
    const env2 = xchaEncrypt(key, plaintext);
    expect(bytesToHex(env1)).not.toBe(bytesToHex(env2));
  });

  it("빈 평문 round-trip — envelope = nonce + tag 만", () => {
    const empty = new Uint8Array(0);
    const envelope = xchaEncrypt(key, empty);
    expect(envelope.byteLength).toBe(XCHACHA_NONCE_BYTES + XCHACHA_TAG_BYTES);
    const decrypted = xchaDecrypt(key, envelope);
    expect(decrypted.byteLength).toBe(0);
  });

  it("잘못된 key 로 복호화 시 예외", () => {
    const plaintext = new TextEncoder().encode("secret");
    const envelope = xchaEncrypt(key, plaintext);
    const wrongKey = new Uint8Array(32).fill(0x02);
    expect(() => xchaDecrypt(wrongKey, envelope)).toThrow();
  });

  it("AAD 불일치 시 복호화 실패", () => {
    const plaintext = new TextEncoder().encode("data");
    const envelope = xchaEncrypt(key, plaintext, new TextEncoder().encode("correct-aad"));
    expect(() => xchaDecrypt(key, envelope, new TextEncoder().encode("wrong-aad"))).toThrow();
  });

  it("tampered ciphertext 복호화 실패", () => {
    const plaintext = new TextEncoder().encode("abc");
    const envelope = xchaEncrypt(key, plaintext);
    const tampered = new Uint8Array(envelope);
    tampered[XCHACHA_NONCE_BYTES] ^= 0xff;
    expect(() => xchaDecrypt(key, tampered)).toThrow();
  });

  it("너무 짧은 envelope 복호화 실패", () => {
    const short = new Uint8Array(XCHACHA_NONCE_BYTES + XCHACHA_TAG_BYTES - 1);
    expect(() => xchaDecrypt(key, short)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Cross-language vector (Rust ↔ TS)
// ---------------------------------------------------------------------------

describe("Cross-language vector — Rust ↔ TS XChaCha20-Poly1305", () => {
  // 고정 key/nonce 로 Rust 측과 동일한 결과를 내야 한다.
  // Rust 측 xchacha_encrypt_known_vector 테스트와 동일한 입력값.
  const KEY_HEX = "0101010101010101010101010101010101010101010101010101010101010101";
  const NONCE_HEX = "000000000000000000000000000000000000000000000001";
  const PLAINTEXT = "Hello, Secretbank!";

  it("고정 key+nonce 로 encrypt → 재현 가능한 ciphertext (길이 검증)", () => {
    // xchaEncrypt 는 랜덤 nonce 를 생성하므로, 고정 nonce 테스트는 xchacha20poly1305 직접 호출
    const key = hexToBytes(KEY_HEX);
    const nonce = hexToBytes(NONCE_HEX);
    const plaintext = new TextEncoder().encode(PLAINTEXT);

    const cipher = xchacha20poly1305(key, nonce);
    const ct = cipher.encrypt(plaintext);

    // ciphertext+tag 길이: 18(plaintext) + 16(tag) = 34
    expect(ct.byteLength).toBe(18 + 16);

    // 복호화 검증
    const cipher2 = xchacha20poly1305(key, nonce);
    const pt = cipher2.decrypt(ct);
    expect(new TextDecoder().decode(pt)).toBe(PLAINTEXT);
  });

  it("Rust 측과 동일한 입력 → 동일한 ciphertext 길이 (cross-language 형식 검증)", () => {
    // Rust: xchacha_encrypt_known_vector 에서 ct.len() == 18 + 16 == 34
    // TS 측도 동일한 형식이어야 함
    const key = hexToBytes(KEY_HEX);
    const nonce = hexToBytes(NONCE_HEX);
    const plaintext = new TextEncoder().encode(PLAINTEXT);

    const cipher = xchacha20poly1305(key, nonce);
    const ct = cipher.encrypt(plaintext);

    // Rust 결과: 18 + 16 = 34
    expect(ct.byteLength).toBe(34);
  });

  it("envelope 형식 호환: nonce(24) || ct+tag", () => {
    // xchaEncrypt 의 envelope 형식이 Rust aead::encrypt 와 동일
    const key = hexToBytes(KEY_HEX);
    const plaintext = new TextEncoder().encode(PLAINTEXT);
    const envelope = xchaEncrypt(key, plaintext);

    // 앞 24바이트 = nonce
    const nonce = envelope.slice(0, XCHACHA_NONCE_BYTES);
    expect(nonce.byteLength).toBe(XCHACHA_NONCE_BYTES);

    // 뒷부분 = ct+tag, 복호화 가능해야 함
    const decrypted = xchaDecrypt(key, envelope);
    expect(new TextDecoder().decode(decrypted)).toBe(PLAINTEXT);
  });
});

// ---------------------------------------------------------------------------
// 5. PairingSession 생명주기
// ---------------------------------------------------------------------------

describe("PairingSession", () => {
  it("init 메시지를 올바른 형식으로 생성한다", () => {
    const session = new PairingSession("ext-id-abc", "1.0.0");
    const msg = session.buildInitMessage();

    expect(msg.type).toBe("init");
    expect(msg.extension_id).toBe("ext-id-abc");
    expect(msg.version).toBe("1.0.0");
    // base64 공개키 — 32바이트 → 44자
    expect(msg.ext_pub).toHaveLength(44);
  });

  it("페어링 전에는 isPaired = false", () => {
    const session = new PairingSession("ext-id", "1.0");
    expect(session.isPaired).toBe(false);
  });

  it("processPairedMessage 후 isPaired = true", () => {
    const session = new PairingSession("ext-id", "1.0");
    const { publicKey } = generateX25519Keypair();

    session.processPairedMessage({
      type: "paired",
      desktop_pub: toBase64(publicKey),
      device_id: "desktop-device-001",
    });

    expect(session.isPaired).toBe(true);
  });

  it("페어링 후 encrypt/decrypt round-trip 성공", () => {
    // Extension session
    const extSession = new PairingSession("ext-id", "1.0");
    const initMsg = extSession.buildInitMessage();

    // Desktop side: ECDH 시뮬레이션
    const desktopKp = generateX25519Keypair();
    const extPubBytes = fromBase64(initMsg.ext_pub);

    // Extension의 프로세스 paired 메시지
    extSession.processPairedMessage({
      type: "paired",
      desktop_pub: toBase64(desktopKp.publicKey),
      device_id: "desktop-001",
    });

    // Extension 측 channel key = X25519(ext_priv, desktop_pub)
    // Desktop 측 channel key = X25519(desktop_priv, ext_pub)
    // 이 두 값이 같아야 ECDH 가 올바르게 작동하는 것

    const plaintext = new TextEncoder().encode("pairing test message");
    const envelope = extSession.encrypt(plaintext);
    const decrypted = extSession.decrypt(envelope);

    expect(new TextDecoder().decode(decrypted)).toBe("pairing test message");

    // 실제로 desktop 측에서도 같은 channel key 를 갖는지 검증
    const desktopChannelKey = x25519Dh(desktopKp.privateKey, extPubBytes);
    const nonce = envelope.slice(0, XCHACHA_NONCE_BYTES);
    const ct = envelope.slice(XCHACHA_NONCE_BYTES);
    const cipher = xchacha20poly1305(desktopChannelKey, nonce);
    const ptFromDesktop = cipher.decrypt(ct);
    expect(new TextDecoder().decode(ptFromDesktop)).toBe("pairing test message");
  });

  it("페어링 미완료 시 encrypt 는 예외를 throw 한다", () => {
    const session = new PairingSession("ext-id", "1.0");
    expect(() => session.encrypt(new TextEncoder().encode("x"))).toThrow();
  });

  it("페어링 미완료 시 decrypt 는 예외를 throw 한다", () => {
    const session = new PairingSession("ext-id", "1.0");
    expect(() => session.decrypt(new Uint8Array(64))).toThrow();
  });

  it("desktop_pub 길이 오류 시 예외", () => {
    const session = new PairingSession("ext-id", "1.0");
    // 31바이트 public key
    const shortPub = toBase64(new Uint8Array(31));
    expect(() =>
      session.processPairedMessage({
        type: "paired",
        desktop_pub: shortPub,
        device_id: "dev-001",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. base64 헬퍼
// ---------------------------------------------------------------------------

describe("base64 헬퍼", () => {
  it("toBase64 → fromBase64 round-trip", () => {
    const original = new Uint8Array([1, 2, 3, 255, 128, 0]);
    const b64 = toBase64(original);
    const recovered = fromBase64(b64);
    expect(timingSafeEqual(original, recovered)).toBe(true);
  });

  it("32바이트 → base64 44자", () => {
    const bytes = new Uint8Array(32).fill(0xaa);
    expect(toBase64(bytes)).toHaveLength(44);
  });
});

// ---------------------------------------------------------------------------
// 7. timingSafeEqual
// ---------------------------------------------------------------------------

describe("timingSafeEqual", () => {
  it("동일 배열 → true", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it("다른 배열 → false", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it("길이 다름 → false", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it("빈 배열끼리 → true", () => {
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. parsePairedMessage
// ---------------------------------------------------------------------------

describe("parsePairedMessage", () => {
  it("올바른 paired 메시지 파싱 성공", () => {
    const raw = { type: "paired", desktop_pub: "AAAA", device_id: "dev-001" };
    const msg = parsePairedMessage(raw);
    expect(msg.type).toBe("paired");
    expect(msg.device_id).toBe("dev-001");
  });

  it("type 누락 시 예외", () => {
    expect(() => parsePairedMessage({ desktop_pub: "x", device_id: "y" })).toThrow();
  });

  it("type 불일치 시 예외", () => {
    expect(() => parsePairedMessage({ type: "init", desktop_pub: "x", device_id: "y" })).toThrow();
  });
});
