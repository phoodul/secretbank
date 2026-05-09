/**
 * @file strength.ts
 * @license AGPL-3.0-or-later
 *
 * zxcvbn-ts 기반 비밀번호 강도 추정 래퍼.
 *
 * zxcvbn-ts (https://github.com/zxcvbn-ts/zxcvbn) 는 기존 zxcvbn 의
 * TypeScript 재작성판으로, 적극적으로 유지보수된다.
 *
 * 사용 패키지:
 *   - @zxcvbn-ts/core        — 핵심 강도 추정 엔진
 *   - @zxcvbn-ts/language-common — 날짜·반복·패턴 등 공통 dictionary
 *   - @zxcvbn-ts/language-en — 영어 dictionary (가장 광범위한 사전)
 *
 * 참고: zxcvbn-ts 의 ko/ja/zh 별도 language 패키지는 npm 에 없다.
 * en + common dictionary 를 기반으로 점수를 산출한다.
 */

import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary as commonDictionary } from "@zxcvbn-ts/language-common";
import { dictionary as enDictionary } from "@zxcvbn-ts/language-en";

// zxcvbn-ts 옵션 초기화 (모듈 로드 시 1회)
zxcvbnOptions.setOptions({
  graphs: adjacencyGraphs,
  dictionary: {
    ...commonDictionary,
    ...enDictionary,
  },
});

/** 비밀번호 강도 점수 (0=매우 취약 ~ 4=매우 강함) */
export type StrengthScore = 0 | 1 | 2 | 3 | 4;

/** 강도 추정 결과 */
export interface StrengthResult {
  /** 0=매우 취약, 1=취약, 2=보통, 3=강함, 4=매우 강함 */
  score: StrengthScore;
  /** 온라인 공격(분당 10회) 기준 추정 크랙 소요 시간 (초) */
  crackTimeSeconds: number;
  /** 사용자에게 보여줄 개선 힌트 (없을 수 있음) */
  feedback?: string;
}

/**
 * 비밀번호의 강도를 추정한다.
 *
 * 동일한 입력에 대해 항상 동일한 결과를 반환한다 (결정론적).
 *
 * @param password - 분석할 비밀번호 문자열
 * @returns 강도 점수, 크랙 예상 시간, 피드백
 *
 * @example
 * estimateStrength("hunter2")
 * // { score: 1, crackTimeSeconds: 3600, feedback: "..." }
 *
 * estimateStrength("correct horse battery staple")
 * // { score: 4, crackTimeSeconds: 1e15, feedback: undefined }
 */
export function estimateStrength(password: string): StrengthResult {
  const result = zxcvbn(password);

  // crackTimesSeconds 는 여러 시나리오를 제공한다.
  // 온라인(throttled) 공격 시나리오를 기준으로 사용.
  const crackTimeSeconds = result.crackTimesSeconds.onlineThrottling100PerHour as number;

  // warning 과 suggestions 를 하나의 문자열로 병합
  const warning = result.feedback.warning ?? "";
  const suggestions = result.feedback.suggestions.join(" ").trim();
  const feedback = [warning, suggestions].filter(Boolean).join(" ") || undefined;

  return {
    score: result.score as StrengthScore,
    crackTimeSeconds,
    feedback,
  };
}
