/**
 * @file __tests__/validation.test.ts
 * @license AGPL-3.0-or-later
 *
 * A4 validation schemas 단위 테스트.
 *
 * 테스트 범위:
 *   - credential: CredentialKindSchema / CredentialMetaSchema (discriminated union)
 *   - recipe: IssuerRecipeSchema (min ≤ max 제약)
 *   - pairing: NMMessageSchema (discriminated union by `type`)
 *
 * 각 schema 에 대해 Positive(통과) + Negative(거부) 케이스를 검증한다.
 */

import { describe, it, expect } from "vitest";
import {
  CredentialKindSchema,
  CredentialMetaSchema,
  ApiKeyMetaSchema,
  PasswordMetaSchema,
  CreditCardMetaSchema,
  IssuerRecipeSchema,
  NMMessageSchema,
  NMMessageInitSchema,
  NMMessagePairSchema,
  NMMessageRevealSchema,
  NMMessageSaveSchema,
} from "../validation/index.js";

// ──────────────────────────────────────────────────────────────────────────────
// 1. CredentialKindSchema
// ──────────────────────────────────────────────────────────────────────────────

describe("CredentialKindSchema", () => {
  it("[positive] api_key 를 허용한다", () => {
    const result = CredentialKindSchema.safeParse("api_key");
    expect(result.success).toBe(true);
  });

  it("[positive] password 를 허용한다", () => {
    const result = CredentialKindSchema.safeParse("password");
    expect(result.success).toBe(true);
  });

  it("[positive] credit_card 를 허용한다", () => {
    const result = CredentialKindSchema.safeParse("credit_card");
    expect(result.success).toBe(true);
  });

  it("[negative] 알 수 없는 kind 를 거부한다", () => {
    const result = CredentialKindSchema.safeParse("oauth_token");
    expect(result.success).toBe(false);
  });

  it("[negative] 빈 문자열을 거부한다", () => {
    const result = CredentialKindSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("[negative] null 을 거부한다", () => {
    const result = CredentialKindSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. CredentialMetaSchema (discriminated union)
// ──────────────────────────────────────────────────────────────────────────────

describe("ApiKeyMetaSchema", () => {
  it("[positive] 최소 필드로 통과한다", () => {
    const result = ApiKeyMetaSchema.safeParse({ kind: "api_key", name: "Stripe secret" });
    expect(result.success).toBe(true);
  });

  it("[positive] issuer_id 포함 통과한다", () => {
    const result = ApiKeyMetaSchema.safeParse({
      kind: "api_key",
      name: "OpenAI key",
      issuer_id: "openai",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] name 이 빈 문자열이면 거부한다", () => {
    const result = ApiKeyMetaSchema.safeParse({ kind: "api_key", name: "" });
    expect(result.success).toBe(false);
  });

  it("[negative] kind 불일치 시 거부한다", () => {
    const result = ApiKeyMetaSchema.safeParse({ kind: "password", name: "test" });
    expect(result.success).toBe(false);
  });
});

describe("PasswordMetaSchema", () => {
  it("[positive] 최소 필드로 통과한다", () => {
    const result = PasswordMetaSchema.safeParse({ kind: "password", name: "GitHub login" });
    expect(result.success).toBe(true);
  });

  it("[positive] url + username 포함 통과한다", () => {
    const result = PasswordMetaSchema.safeParse({
      kind: "password",
      name: "GitHub login",
      url: "https://github.com",
      username: "phoodul",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] 잘못된 url 형식은 거부한다", () => {
    const result = PasswordMetaSchema.safeParse({
      kind: "password",
      name: "test",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreditCardMetaSchema", () => {
  it("[positive] 유효한 카드 정보로 통과한다", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "Shinhan Visa",
      card_number: "4111111111111111", // 16자리
      cvc: "123",
      expiry_month: "12",
      expiry_year: "27",
      holder: "JSS",
    });
    expect(result.success).toBe(true);
  });

  it("[positive] 4자리 CVC 도 허용한다 (Amex)", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "Amex",
      card_number: "378282246310005", // 15자리
      cvc: "1234",
      expiry_month: "01",
      expiry_year: "2028",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] 카드번호 12자리 이하는 거부한다", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "bad",
      card_number: "411111111111", // 12자리
      cvc: "123",
      expiry_month: "12",
      expiry_year: "27",
    });
    expect(result.success).toBe(false);
  });

  it("[negative] CVC 에 문자가 섞이면 거부한다", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "bad",
      card_number: "4111111111111111",
      cvc: "12X",
      expiry_month: "12",
      expiry_year: "27",
    });
    expect(result.success).toBe(false);
  });

  it("[negative] 만료 월이 00 이면 거부한다", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "bad",
      card_number: "4111111111111111",
      cvc: "123",
      expiry_month: "00",
      expiry_year: "27",
    });
    expect(result.success).toBe(false);
  });

  it("[negative] 만료 월이 13 이면 거부한다", () => {
    const result = CreditCardMetaSchema.safeParse({
      kind: "credit_card",
      name: "bad",
      card_number: "4111111111111111",
      cvc: "123",
      expiry_month: "13",
      expiry_year: "27",
    });
    expect(result.success).toBe(false);
  });
});

describe("CredentialMetaSchema (discriminated union)", () => {
  it("[positive] kind=api_key 분기가 동작한다", () => {
    const result = CredentialMetaSchema.safeParse({ kind: "api_key", name: "key" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("api_key");
    }
  });

  it("[positive] kind=password 분기가 동작한다", () => {
    const result = CredentialMetaSchema.safeParse({ kind: "password", name: "pw" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("password");
    }
  });

  it("[positive] kind=credit_card 분기가 동작한다", () => {
    const result = CredentialMetaSchema.safeParse({
      kind: "credit_card",
      name: "card",
      card_number: "4111111111111111",
      cvc: "123",
      expiry_month: "06",
      expiry_year: "28",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] 알 수 없는 kind 는 union 모두에서 거부된다", () => {
    const result = CredentialMetaSchema.safeParse({ kind: "ssh_key", name: "test" });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. IssuerRecipeSchema
// ──────────────────────────────────────────────────────────────────────────────

describe("IssuerRecipeSchema", () => {
  const validRecipe = {
    min: 12,
    max: 64,
    uppercase: 1,
    number: 1,
    special: 1,
    forbidden: " '`\\",
  };

  it("[positive] 유효한 레시피가 통과한다", () => {
    const result = IssuerRecipeSchema.safeParse(validRecipe);
    expect(result.success).toBe(true);
  });

  it("[positive] min === max 를 허용한다", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, min: 16, max: 16 });
    expect(result.success).toBe(true);
  });

  it("[positive] forbidden 이 빈 문자열이어도 통과한다", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, forbidden: "" });
    expect(result.success).toBe(true);
  });

  it("[positive] uppercase/number/special 이 0이어도 통과한다", () => {
    const result = IssuerRecipeSchema.safeParse({
      ...validRecipe,
      uppercase: 0,
      number: 0,
      special: 0,
    });
    expect(result.success).toBe(true);
  });

  it("[negative] min > max 이면 거부한다", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, min: 64, max: 12 });
    expect(result.success).toBe(false);
  });

  it("[negative] min 이 0이면 거부한다 (최소 1)", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, min: 0 });
    expect(result.success).toBe(false);
  });

  it("[negative] uppercase 가 음수이면 거부한다", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, uppercase: -1 });
    expect(result.success).toBe(false);
  });

  it("[negative] 소수점 number 는 거부한다 (int 전용)", () => {
    const result = IssuerRecipeSchema.safeParse({ ...validRecipe, number: 1.5 });
    expect(result.success).toBe(false);
  });

  it("[negative] max 가 누락되면 거부한다", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { max: _max, ...noMax } = validRecipe;
    const result = IssuerRecipeSchema.safeParse(noMax);
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. NMMessageSchema (discriminated union by `type`)
// ──────────────────────────────────────────────────────────────────────────────

describe("NMMessageInitSchema", () => {
  it("[positive] 유효한 init 메시지가 통과한다", () => {
    const result = NMMessageInitSchema.safeParse({
      type: "init",
      extension_id: "abcdefghijklmnopqrstuvwxyzAB",
      version: "1.0.0",
      ext_pub: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] version 이 빈 문자열이면 거부한다", () => {
    const result = NMMessageInitSchema.safeParse({ type: "init", version: "" });
    expect(result.success).toBe(false);
  });

  it("[negative] type 이 다른 값이면 거부한다", () => {
    const result = NMMessageInitSchema.safeParse({ type: "pair", version: "1.0" });
    expect(result.success).toBe(false);
  });
});

describe("NMMessagePairSchema", () => {
  it("[positive] 유효한 pair 메시지가 통과한다", () => {
    const result = NMMessagePairSchema.safeParse({ type: "pair", code: "123456" });
    expect(result.success).toBe(true);
  });

  it("[negative] code 가 빈 문자열이면 거부한다", () => {
    const result = NMMessagePairSchema.safeParse({ type: "pair", code: "" });
    expect(result.success).toBe(false);
  });
});

describe("NMMessageRevealSchema", () => {
  it("[positive] 유효한 reveal 메시지가 통과한다", () => {
    const result = NMMessageRevealSchema.safeParse({
      type: "reveal",
      credential_id: "cred-uuid-123",
      session_token: "tok-abc",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] session_token 누락 시 거부한다", () => {
    const result = NMMessageRevealSchema.safeParse({
      type: "reveal",
      credential_id: "cred-uuid-123",
    });
    expect(result.success).toBe(false);
  });
});

describe("NMMessageSaveSchema", () => {
  it("[positive] 유효한 save 메시지가 통과한다", () => {
    const result = NMMessageSaveSchema.safeParse({
      type: "save",
      kind: "api_key",
      issuer_id: "stripe",
      name: "Stripe secret",
      value: "sk_test_xxx",
      session_token: "tok-abc",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] kind 가 잘못된 값이면 거부한다", () => {
    const result = NMMessageSaveSchema.safeParse({
      type: "save",
      kind: "ssh_key",
      issuer_id: "github",
      name: "SSH",
      value: "-----BEGIN",
      session_token: "tok",
    });
    expect(result.success).toBe(false);
  });

  it("[negative] value 가 빈 문자열이면 거부한다", () => {
    const result = NMMessageSaveSchema.safeParse({
      type: "save",
      kind: "password",
      issuer_id: "github",
      name: "GitHub",
      value: "",
      session_token: "tok",
    });
    expect(result.success).toBe(false);
  });
});

describe("NMMessageSchema (discriminated union)", () => {
  it("[positive] type=init 분기가 동작한다", () => {
    const result = NMMessageSchema.safeParse({
      type: "init",
      extension_id: "abcdefghijklmnopqrstuvwxyzAB",
      version: "0.1.0",
      ext_pub: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("init");
    }
  });

  it("[positive] type=pair 분기가 동작한다", () => {
    const result = NMMessageSchema.safeParse({ type: "pair", code: "654321" });
    expect(result.success).toBe(true);
  });

  it("[positive] type=reveal 분기가 동작한다", () => {
    const result = NMMessageSchema.safeParse({
      type: "reveal",
      credential_id: "id-1",
      session_token: "tok",
    });
    expect(result.success).toBe(true);
  });

  it("[positive] type=save 분기가 동작한다", () => {
    const result = NMMessageSchema.safeParse({
      type: "save",
      kind: "credit_card",
      issuer_id: "shinhan",
      name: "Shinhan",
      value: "4111111111111111",
      session_token: "tok",
    });
    expect(result.success).toBe(true);
  });

  it("[negative] 알 수 없는 type 은 union 모두에서 거부된다", () => {
    const result = NMMessageSchema.safeParse({ type: "unknown", data: "x" });
    expect(result.success).toBe(false);
  });

  it("[negative] type 누락 시 거부한다", () => {
    const result = NMMessageSchema.safeParse({ version: "1.0" });
    expect(result.success).toBe(false);
  });
});
