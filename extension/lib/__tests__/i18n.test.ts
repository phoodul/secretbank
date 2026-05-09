/**
 * @file i18n.test.ts
 * @license AGPL-3.0-or-later
 *
 * i18n 키 resolution + drift detection 테스트.
 *
 * 테스트 목적:
 *   1. I18N_KEYS 상수의 모든 값이 extension/locales/en.yml 에 존재한다 (누락 방지)
 *   2. extension/locales/en.yml 의 모든 키가 I18N_KEYS 에 존재한다 (추가 방지)
 *   3. 4개 로케일 파일이 동일한 키 셋을 가진다 (lang 간 drift 방지)
 *   4. YAML 파싱이 정상 동작한다
 *
 * WXT 빌드 없는 Vitest 환경이므로:
 *   - browser.i18n.getMessage 는 mock 처리
 *   - @wxt-dev/i18n/build 의 parseMessagesText 로 YAML → ParsedMessage 배열 추출
 *   - fs.readFileSync 로 로케일 파일 직접 읽음
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMessagesText } from "@wxt-dev/i18n/build";
import { I18N_KEYS } from "@secretbank/shared";

// extension/ 디렉토리의 절대 경로 (vitest 는 프로젝트 루트에서 실행됨)
const LOCALES_DIR = resolve(import.meta.dirname, "../../locales");

/**
 * YAML 파일에서 최상위 키 목록을 추출한다.
 * WXT 내장 @@ 접두사 예약 키 (@@extension_id, @@ui_locale 등) 는 제외한다.
 */
function getKeysFromYaml(lang: string): string[] {
  const filePath = resolve(LOCALES_DIR, `${lang}.yml`);
  const text = readFileSync(filePath, "utf-8");
  const messages = parseMessagesText(text, "YAML");
  // ParsedMessage.key 는 string[] (dot-notation segments)
  // 최상위 키는 segments 를 join('_') 한 값
  // WXT 내장 @@ 예약 키는 테스트 대상에서 제외
  return messages.map((m) => m.key.join("_")).filter((k) => !k.startsWith("@@"));
}

// zh → zh_CN: Chrome 은 zh 대신 zh_CN / zh_TW 형식을 요구 (web extension 로케일 규격)
const LOCALES = ["en", "ko", "ja", "zh_CN"] as const;

// I18N_KEYS 의 모든 value (YAML 키 이름)
const EXPECTED_KEYS = Object.values(I18N_KEYS).sort();

describe("I18N_KEYS vs YAML drift detection", () => {
  it("en.yml 의 키가 I18N_KEYS 와 완전히 일치한다", () => {
    const yamlKeys = getKeysFromYaml("en").sort();
    // I18N_KEYS 에 있는 키가 YAML 에 모두 존재하는지 (누락 방지)
    for (const key of EXPECTED_KEYS) {
      expect(yamlKeys, `I18N_KEYS.${key} 가 en.yml 에 없음`).toContain(key);
    }
    // YAML 에 있는 키가 I18N_KEYS 에 모두 존재하는지 (미등록 키 방지)
    for (const key of yamlKeys) {
      expect(EXPECTED_KEYS, `en.yml 의 "${key}" 키가 I18N_KEYS 에 없음`).toContain(key);
    }
    // 개수도 일치해야 함
    expect(yamlKeys).toHaveLength(EXPECTED_KEYS.length);
  });

  it("4개 로케일이 동일한 키 셋을 가진다 (lang 간 drift 방지)", () => {
    const enKeys = getKeysFromYaml("en").sort();
    for (const lang of LOCALES.filter((l) => l !== "en")) {
      const langKeys = getKeysFromYaml(lang).sort();
      expect(langKeys, `${lang}.yml 의 키가 en.yml 과 다름`).toEqual(enKeys);
    }
  });

  it("en.yml 에 최소 10개 키가 존재한다", () => {
    const enKeys = getKeysFromYaml("en");
    expect(enKeys.length).toBeGreaterThanOrEqual(10);
  });
});

describe("YAML 파싱 정상 동작", () => {
  for (const lang of LOCALES) {
    it(`${lang}.yml 이 파싱 가능하다`, () => {
      expect(() => getKeysFromYaml(lang)).not.toThrow();
    });

    it(`${lang}.yml 의 popup_title 키가 존재한다`, () => {
      const keys = getKeysFromYaml(lang);
      expect(keys).toContain("popup_title");
    });

    it(`${lang}.yml 의 pairing_start 키가 존재한다`, () => {
      const keys = getKeysFromYaml(lang);
      expect(keys).toContain("pairing_start");
    });
  }
});

describe("I18N_KEYS 상수 구조", () => {
  it("POPUP_TITLE 이 'popup_title' 값을 가진다", () => {
    expect(I18N_KEYS.POPUP_TITLE).toBe("popup_title");
  });

  it("POPUP_GREETING 이 'popup_greeting' 값을 가진다", () => {
    expect(I18N_KEYS.POPUP_GREETING).toBe("popup_greeting");
  });

  it("PAIRING_START 이 'pairing_start' 값을 가진다", () => {
    expect(I18N_KEYS.PAIRING_START).toBe("pairing_start");
  });

  it("SAVE_BUTTON 이 'save_button' 값을 가진다", () => {
    expect(I18N_KEYS.SAVE_BUTTON).toBe("save_button");
  });

  it("총 48개의 키가 정의되어 있다 (A5: 10 + A6: 9 + B-5: 9 + B-7: 14 + D-3: 6 신규)", () => {
    expect(Object.keys(I18N_KEYS)).toHaveLength(48);
  });

  it("모든 키가 string 타입이다", () => {
    for (const [, value] of Object.entries(I18N_KEYS)) {
      expect(typeof value).toBe("string");
    }
  });
});
