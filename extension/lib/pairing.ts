/**
 * @file pairing.ts
 * @license AGPL-3.0-or-later
 *
 * B-4: Extension 측 페어링 프로토콜 구현.
 *
 * X25519 ECDH + XChaCha20-Poly1305 기반 Extension ↔ Desktop 페어링.
 * 모든 암호 연산은 ./crypto.ts 를 통해 @noble/curves, @noble/ciphers 에 위임한다.
 *
 * 메시지 흐름 (Extension 관점):
 *   1. Extension → nm-host: { type: "init", extension_id, version, ext_pub }
 *      - generateX25519Keypair() 로 ephemeral keypair 생성
 *      - ext_pub 는 base64 로 인코딩
 *   2. nm-host → Extension: { type: "paired", desktop_pub, device_id }
 *      - desktop_pub 를 base64 에서 디코딩
 *      - x25519Dh(ext_priv, desktop_pub) → raw_shared
 *      - HKDF 없이 raw_shared 를 channel_key 로 사용 (secretbank-crypto 와 동일)
 *      ※ 실제로는 derive_channel_key 가 HKDF 를 통해 파생 — B-6 에서 맞춤
 *   3. 이후 모든 메시지는 channel_key 로 XChaCha20-Poly1305 암호화
 *
 * 참고: Rust 측 pairing.rs 와 1:1 대칭 구현.
 */

import {
  generateX25519Keypair,
  x25519Dh,
  xchaEncrypt,
  xchaDecrypt,
  toBase64,
  fromBase64,
  type X25519Keypair,
} from "./crypto.js";
import { getPairing, setPairing, clearPairing, type PairingStorage } from "./storage.js";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** Extension 측 페어링 세션 상태 */
export interface PairingSessionState {
  /** Extension ephemeral keypair (private key 는 노출 금지) */
  readonly keypair: X25519Keypair;
  /** 페어링 완료 후 파생된 channel key (32바이트, null = 미완료) */
  channelKey: Uint8Array | null;
  /** Desktop 디바이스 ID (페어링 완료 후 설정) */
  deviceId: string | null;
}

/** init 메시지 페이로드 */
export interface InitPayload {
  type: "init";
  extension_id: string;
  version: string;
  ext_pub: string;
}

/** paired 메시지 페이로드 */
export interface PairedPayload {
  type: "paired";
  desktop_pub: string;
  device_id: string;
}

// ---------------------------------------------------------------------------
// PairingSession 클래스
// ---------------------------------------------------------------------------

/**
 * Extension 측 페어링 세션.
 *
 * 사용 예:
 *   const session = new PairingSession('ext-id', '1.0.0');
 *   const initMsg = session.buildInitMessage();
 *   // initMsg 를 nm-host 로 전송
 *   // nm-host 로부터 paired 메시지 수신 후:
 *   session.processPairedMessage(pairedMsg);
 *   // 이후 세션을 사용해 암호화된 메시지 송수신
 */
export class PairingSession {
  private readonly state: PairingSessionState;
  private readonly extensionId: string;
  private readonly version: string;

  constructor(extensionId: string, version: string) {
    this.extensionId = extensionId;
    this.version = version;
    this.state = {
      keypair: generateX25519Keypair(),
      channelKey: null,
      deviceId: null,
    };
  }

  /**
   * Extension 공개키를 base64 로 반환.
   * init 메시지에 포함되어 nm-host 로 전달된다.
   */
  get extPublicKeyB64(): string {
    return toBase64(this.state.keypair.publicKey);
  }

  /** 페어링 완료 여부 */
  get isPaired(): boolean {
    return this.state.channelKey !== null;
  }

  /**
   * Extension 개인키를 base64 로 반환.
   * saveToStorage 에서 chrome.storage.local 저장 시 사용된다.
   *
   * ⚠️  개인키 노출 — 스토리지 저장 목적으로만 사용할 것.
   *   위협 모델 T7 참조.
   */
  getPrivateKeyB64(): string {
    return toBase64(this.state.keypair.privateKey);
  }

  /**
   * 페어링된 Desktop 공개키를 base64 로 반환.
   * 페어링 완료 전에는 null.
   */
  get desktopPublicKeyB64(): string | null {
    if (!this.state.channelKey) return null;
    // channelKey 는 x25519(ext_priv, desktop_pub) 의 결과이므로
    // desktop_pub 를 별도 저장해야 한다.
    return this._desktopPubB64;
  }

  /** Desktop 공개키 base64 (processPairedMessage 에서 저장) */
  private _desktopPubB64: string | null = null;

  /** 페어링된 디바이스 ID. 페어링 완료 전에는 null. */
  get pairedDeviceId(): string | null {
    return this.state.deviceId;
  }

  /**
   * init 메시지 페이로드 생성.
   * Extension → nm-host 전송용.
   */
  buildInitMessage(): InitPayload {
    return {
      type: "init",
      extension_id: this.extensionId,
      version: this.version,
      ext_pub: this.extPublicKeyB64,
    };
  }

  /**
   * nm-host 로부터 수신한 paired 메시지를 처리한다.
   *
   * 1. desktop_pub (base64) 를 디코딩
   * 2. ECDH: x25519(ext_priv, desktop_pub) → raw_shared
   * 3. raw_shared 를 channel_key 로 저장
   *    (Rust 측 derive_channel_key 는 HKDF 를 추가 적용하지만
   *     B-4 는 symmetric ECDH 검증이 목적이므로 raw shared 사용.
   *     B-6 에서 HKDF 맞춤 적용.)
   * 4. device_id 저장
   */
  processPairedMessage(msg: PairedPayload): void {
    const desktopPub = fromBase64(msg.desktop_pub);
    if (desktopPub.byteLength !== 32) {
      throw new Error(`desktop_pub 길이 오류: expected 32 bytes, got ${desktopPub.byteLength}`);
    }
    // ECDH: X25519(ext_priv, desktop_pub)
    const rawShared = x25519Dh(this.state.keypair.privateKey, desktopPub);
    this.state.channelKey = rawShared;
    this.state.deviceId = msg.device_id;
    // desktop_pub 를 별도 보관 — saveToStorage 에서 참조
    this._desktopPubB64 = msg.desktop_pub;
  }

  /**
   * channel key 로 평문을 암호화한다.
   *
   * @param plaintext 평문 Uint8Array
   * @param aad Additional Authenticated Data (optional)
   * @returns nonce(24)+ciphertext+tag Uint8Array
   * @throws Error 페어링 미완료 시
   */
  encrypt(plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
    if (!this.state.channelKey) {
      throw new Error("페어링 미완료 — processPairedMessage() 먼저 호출");
    }
    return xchaEncrypt(this.state.channelKey, plaintext, aad);
  }

  /**
   * channel key 로 암호문(envelope)을 복호화한다.
   *
   * @param envelope nonce(24)+ciphertext+tag
   * @param aad Additional Authenticated Data
   * @returns 복호화된 평문
   * @throws Error 페어링 미완료 또는 인증 실패 시
   */
  decrypt(envelope: Uint8Array, aad?: Uint8Array): Uint8Array {
    if (!this.state.channelKey) {
      throw new Error("페어링 미완료 — processPairedMessage() 먼저 호출");
    }
    return xchaDecrypt(this.state.channelKey, envelope, aad);
  }
}

// ---------------------------------------------------------------------------
// 스토리지 헬퍼 — PairingSession ↔ chrome.storage.local 통합
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 에서 페어링 정보를 읽어 PairingStorage 를 반환한다.
 *
 * PairingDialog 가 초기화 시 이미 페어링된 상태인지 확인할 때 사용한다.
 * PairingSession 은 개인키를 자체 보관하므로, 복원 시에는
 * 저장된 desktopPub + deviceId 만 반환한다 (개인키 재구성 없음).
 *
 * @returns PairingStorage 또는 null (미페어링)
 */
export async function restoreFromStorage(): Promise<PairingStorage | null> {
  return getPairing();
}

/**
 * PairingSession 의 페어링 완료 상태를 chrome.storage.local 에 저장한다.
 *
 * ⚠️  extensionPriv(개인키)는 base64 평문으로 저장됨 — 위협 모델 T7 참조.
 *   chrome.storage.local 은 OS 수준 암호화(BitLocker/FileVault)에 의존한다.
 *   개인키는 페어링 1회용 ephemeral 이므로 재페어링 시 새 키가 생성된다.
 *
 * @param session 페어링 완료된 PairingSession
 */
export async function saveToStorage(session: PairingSession): Promise<void> {
  if (!session.isPaired) {
    throw new Error("saveToStorage: 페어링 미완료 세션은 저장할 수 없습니다.");
  }
  const data: PairingStorage = {
    extensionPriv: session.getPrivateKeyB64(),
    desktopPub: session.desktopPublicKeyB64 ?? "",
    deviceId: session.pairedDeviceId ?? "",
    pairedAt: Date.now(),
  };
  await setPairing(data);
}

/**
 * chrome.storage.local 에서 페어링 정보를 삭제한다.
 * 재페어링 시작 전 호출한다.
 */
export async function clearStorage(): Promise<void> {
  await clearPairing();
}

// ---------------------------------------------------------------------------
// 유틸 — paired 메시지 파싱 헬퍼
// ---------------------------------------------------------------------------

/**
 * raw object 를 PairedPayload 로 검증/변환한다.
 * type guard 역할 — zod schema 없이 최소 검증.
 */
export function parsePairedMessage(raw: unknown): PairedPayload {
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { type?: unknown }).type !== "paired" ||
    typeof (raw as { desktop_pub?: unknown }).desktop_pub !== "string" ||
    typeof (raw as { device_id?: unknown }).device_id !== "string"
  ) {
    throw new Error("paired 메시지 형식 오류");
  }
  return raw as PairedPayload;
}
