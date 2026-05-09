// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// T-24-E-E2: Issuer 별 password 생성 레시피.
//
// 우선순위: preset > user > heuristic (source 필드로 구분).
// domain = eTLD+1 기준 (e.g. "github.com").

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 레시피 source 구분
// ---------------------------------------------------------------------------

/// 레시피의 출처를 나타낸다.
///
/// - `Preset`    : seed 에 의해 사전 등록된 레시피 (최우선)
/// - `User`      : 사용자가 GeneratorPanel 에서 직접 조정한 레시피 (silent 등록)
/// - `Heuristic` : input.pattern/minLength/maxLength 분석으로 자동 추출한 레시피
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecipeSource {
    Preset,
    User,
    Heuristic,
}

impl RecipeSource {
    /// DB 저장 문자열
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Preset => "preset",
            Self::User => "user",
            Self::Heuristic => "heuristic",
        }
    }

    /// DB 저장 문자열에서 복원
    pub fn try_from_str(s: &str) -> Option<Self> {
        match s {
            "preset" => Some(Self::Preset),
            "user" => Some(Self::User),
            "heuristic" => Some(Self::Heuristic),
            _ => None,
        }
    }

    /// 우선순위 (낮을수록 높은 우선순위)
    fn priority(self) -> u8 {
        match self {
            Self::Preset => 0,
            Self::User => 1,
            Self::Heuristic => 2,
        }
    }
}

impl PartialOrd for RecipeSource {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RecipeSource {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority().cmp(&other.priority())
    }
}

// ---------------------------------------------------------------------------
// IssuerRecipe 구조체
// ---------------------------------------------------------------------------

/// 발급사(Issuer) 별 password 생성 규칙.
///
/// extension GeneratorPanel 에서 이 레시피를 읽어 옵션 초기값으로 사용한다.
/// TS shared lib 의 `IssuerRecipe` 와 필드 이름/타입이 동일하게 유지된다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IssuerRecipe {
    /// 최소 길이
    pub min: u32,
    /// 최대 길이
    pub max: u32,
    /// 대문자 최소 개수
    pub uppercase: u32,
    /// 숫자 최소 개수
    pub number: u32,
    /// 특수문자 최소 개수
    pub special: u32,
    /// 사용 불가 문자 목록 (빈 문자열 = 제한 없음)
    #[serde(default)]
    pub forbidden: String,
}

impl Default for IssuerRecipe {
    /// 기본 레시피 — 모든 문자 클래스 허용, 길이 16.
    fn default() -> Self {
        Self {
            min: 16,
            max: 64,
            uppercase: 1,
            number: 1,
            special: 1,
            forbidden: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// DB 저장 래퍼
// ---------------------------------------------------------------------------

/// DB 조회 결과 — domain + source + recipe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredRecipe {
    pub domain: String,
    pub source: RecipeSource,
    pub recipe: IssuerRecipe,
    /// unix ms
    pub updated_at: i64,
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recipe_source_ordering() {
        assert!(RecipeSource::Preset < RecipeSource::User);
        assert!(RecipeSource::User < RecipeSource::Heuristic);
        assert!(RecipeSource::Preset < RecipeSource::Heuristic);
    }

    #[test]
    fn recipe_source_round_trip() {
        for (s, v) in [
            ("preset", RecipeSource::Preset),
            ("user", RecipeSource::User),
            ("heuristic", RecipeSource::Heuristic),
        ] {
            assert_eq!(RecipeSource::try_from_str(s), Some(v));
            assert_eq!(v.as_str(), s);
        }
        assert_eq!(RecipeSource::try_from_str("unknown"), None);
    }

    #[test]
    fn issuer_recipe_default_sensible() {
        let r = IssuerRecipe::default();
        assert!(r.min <= r.max);
        assert!(r.min > 0);
    }

    #[test]
    fn issuer_recipe_serde_round_trip() {
        let r = IssuerRecipe {
            min: 8,
            max: 32,
            uppercase: 2,
            number: 1,
            special: 0,
            forbidden: "\"'`\\".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        let r2: IssuerRecipe = serde_json::from_str(&json).unwrap();
        assert_eq!(r, r2);
    }
}
