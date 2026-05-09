/**
 * @file types.smoke.test.ts
 * @license AGPL-3.0-or-later
 *
 * @secretbank/shared 타입 smoke test — 모든 export 가 컴파일되고
 * 올바른 타입 구조를 갖는지 검증한다.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
  CredentialKind,
  IssuerRecipe,
  PairingState,
  SessionToken,
  NMMessage,
  NMMessageInit,
  NMMessagePair,
  NMMessageReveal,
  NMMessageSave,
} from "../index.js";

describe("CredentialKind", () => {
  it("Rust CredentialKind 와 동일한 3가지 variant 를 가진다", () => {
    // Rust: ApiKey("api_key") | Password("password") | CreditCard("credit_card")
    expectTypeOf<CredentialKind>().toEqualTypeOf<"api_key" | "password" | "credit_card">();
  });

  it("유효한 값을 할당할 수 있다", () => {
    const a: CredentialKind = "api_key";
    const b: CredentialKind = "password";
    const c: CredentialKind = "credit_card";
    // 런타임 사용 — 타입 검사를 위한 dummy assertion
    expect([a, b, c]).toHaveLength(3);
  });
});

describe("IssuerRecipe", () => {
  it("모든 필드가 존재한다", () => {
    expectTypeOf<IssuerRecipe>().toMatchTypeOf<{
      min: number;
      max: number;
      uppercase: number;
      number: number;
      special: number;
      forbidden: string;
    }>();
  });

  it("올바른 구조체를 만들 수 있다", () => {
    const recipe: IssuerRecipe = {
      min: 12,
      max: 64,
      uppercase: 1,
      number: 1,
      special: 1,
      forbidden: " '`\\",
    };
    expect(recipe.min).toBe(12);
  });
});

describe("PairingState", () => {
  it("4가지 state 를 가진다", () => {
    expectTypeOf<PairingState>().toEqualTypeOf<"Idle" | "Pairing" | "Paired" | "Failed">();
  });
});

describe("SessionToken", () => {
  it("token(string) + expires_at(number) 필드를 가진다", () => {
    expectTypeOf<SessionToken>().toMatchTypeOf<{
      token: string;
      expires_at: number;
    }>();
  });
});

describe("NMMessage discriminated union", () => {
  it("init 메시지 구조가 올바르다", () => {
    const msg: NMMessageInit = { type: "init", version: "1.0" };
    expect(msg.type).toBe("init");
  });

  it("pair 메시지 구조가 올바르다", () => {
    const msg: NMMessagePair = { type: "pair", code: "123456" };
    expect(msg.type).toBe("pair");
  });

  it("reveal 메시지 구조가 올바르다", () => {
    const msg: NMMessageReveal = {
      type: "reveal",
      credential_id: "cred-1",
      session_token: "tok-abc",
    };
    expect(msg.type).toBe("reveal");
  });

  it("save 메시지 구조가 올바르다", () => {
    const msg: NMMessageSave = {
      type: "save",
      kind: "api_key",
      issuer_id: "issuer-1",
      name: "MY_KEY",
      value: "sk-xxx",
      session_token: "tok-abc",
    };
    expect(msg.type).toBe("save");
  });

  it("NMMessage union 이 4가지 타입을 커버한다", () => {
    expectTypeOf<NMMessage>().toEqualTypeOf<
      NMMessageInit | NMMessagePair | NMMessageReveal | NMMessageSave
    >();
  });
});
