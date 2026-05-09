/**
 * @file diceware.ts
 * @license AGPL-3.0-or-later
 *
 * Diceware 비밀문구 생성기.
 *
 * BIP-0039 공식 wordlist 를 사용한다:
 *   출처: https://github.com/bitcoin/bips/tree/master/bip-0039
 *   라이선스: CC0 1.0 Universal (Public Domain) — 상업적 사용 가능, 저작권 표시 불요
 *
 * 언어 지원:
 *   - en  : English     (2048 단어, BIP-39 영어 목록)
 *   - ko  : 한국어      (2048 단어, BIP-39 한글 목록)
 *   - ja  : 日本語      (2048 단어, BIP-39 일본어 목록)
 *   - zh  : 简体中文    (2048 단어, BIP-39 중국어 간체 목록)
 *
 * 보안:
 *   - CSPRNG 전용: `crypto.getRandomValues` 사용. `Math.random` 절대 사용 금지.
 *   - 6단어 기준 엔트로피: log2(2048^6) ≈ 66 bits
 */

import enWords from "./wordlists/en.json" with { type: "json" };
import koWords from "./wordlists/ko.json" with { type: "json" };
import jaWords from "./wordlists/ja.json" with { type: "json" };
import zhWords from "./wordlists/zh.json" with { type: "json" };

/** 지원하는 Diceware 언어 코드 */
export type DicewareLang = "en" | "ko" | "ja" | "zh";

/** 언어별 BIP-39 wordlist 매핑 */
const WORDLISTS: Record<DicewareLang, readonly string[]> = {
  en: enWords as string[],
  ko: koWords as string[],
  ja: jaWords as string[],
  zh: zhWords as string[],
};

/**
 * CSPRNG 로 안전한 랜덤 정수를 생성한다.
 *
 * @param max - 반환값의 상한 (배타적). max < 2^32 이어야 한다.
 * @returns [0, max) 범위의 정수
 */
function secureRandomInt(max: number): number {
  // 편향 제거(rejection sampling): max 가 2^32 의 약수가 아닌 경우를 처리
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    // buf[0] 은 항상 존재하는데 TypeScript 의 noUncheckedIndexedAccess 를 만족시키기 위해 ?? 를 사용
    n = buf[0] ?? 0;
  } while (n >= limit);
  return n % max;
}

/**
 * Diceware 비밀문구를 생성한다.
 *
 * @param lang      - 사용할 언어 코드 (기본값: "en")
 * @param wordCount - 생성할 단어 수 (기본값: 6)
 * @param separator - 단어 구분자 (기본값: " ")
 * @returns 선택된 단어들을 separator 로 이어 붙인 문자열
 *
 * @example
 * generateDiceware("ko", 6, "-")
 * // "거짓 도심 공정 나무 발표 수면" 형태의 결과
 */
export function generateDiceware(
  lang: DicewareLang = "en",
  wordCount: number = 6,
  separator: string = " ",
): string {
  if (wordCount < 1) throw new RangeError("wordCount 는 1 이상이어야 합니다");

  const wordlist = WORDLISTS[lang];
  // 방어적 확인: wordlist 는 항상 2048개여야 한다
  if (wordlist.length !== 2048) {
    throw new Error(`${lang} wordlist 크기가 올바르지 않습니다: ${wordlist.length}`);
  }

  const chosen: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = secureRandomInt(wordlist.length);
    const word = wordlist[idx];
    if (word === undefined) throw new Error("wordlist 인덱스 오류");
    chosen.push(word);
  }

  return chosen.join(separator);
}

/**
 * 지정된 언어의 BIP-39 wordlist 를 반환한다 (테스트 및 검증용).
 *
 * @param lang - 언어 코드
 * @returns 읽기 전용 wordlist 배열 (2048개)
 */
export function getWordlist(lang: DicewareLang): readonly string[] {
  return WORDLISTS[lang];
}
