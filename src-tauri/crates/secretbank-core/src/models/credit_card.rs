//! Credit card credential model — Phase 3-A (M24).
//!
//! # 보안 설계
//! - `last_4` 만 평문 DB (`credit_card_meta`). card_number / CVC 는 age vault 에 별도 경로 저장.
//! - `CreditCardSecret` 은 `SecretBox<String>` 으로 래핑 → Drop 시 자동 zeroize (B.5-1).
//! - `CreditCardSummary` 는 평문 카드번호 / CVC / PIN 미포함 (B.1-3).
//! - `CreditCardInput.card_number_plain` 은 IPC 통과 시 평문이나 backend 가 즉시 SecretBox 래핑
//!   + age vault 저장 후 drop (3-A-5 에서 구현). 구조체 자체는 PartialEq 미구현.

use secrecy::SecretBox;
use serde::{Deserialize, Serialize};

use crate::id::{CredentialId, IssuerId};

// ---------------------------------------------------------------------------
// CardBrand
// ---------------------------------------------------------------------------

/// Payment card network brand.
///
/// SQLite TEXT 컬럼 ↔ enum 변환은 `as_str()` / `from_str_safe()` 로 처리.
/// `serde(rename_all = "lowercase")` 적용으로 JSON 직렬화도 소문자.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CardBrand {
    Visa,
    Mastercard,
    Amex,
    Discover,
    Jcb,
    Diners,
    #[default]
    Unknown,
}

impl CardBrand {
    /// SQLite TEXT 컬럼에 저장할 소문자 문자열 반환.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Visa => "visa",
            Self::Mastercard => "mastercard",
            Self::Amex => "amex",
            Self::Discover => "discover",
            Self::Jcb => "jcb",
            Self::Diners => "diners",
            Self::Unknown => "unknown",
        }
    }

    /// SQLite TEXT → enum. 알 수 없는 값은 `Unknown` 으로 보수적 처리 (대소문자 구분).
    pub fn from_str_safe(s: &str) -> Self {
        match s {
            "visa" => Self::Visa,
            "mastercard" => Self::Mastercard,
            "amex" => Self::Amex,
            "discover" => Self::Discover,
            "jcb" => Self::Jcb,
            "diners" => Self::Diners,
            _ => Self::Unknown,
        }
    }
}

// ---------------------------------------------------------------------------
// CreditCardMeta — credit_card_meta 테이블 평문 메타데이터
// ---------------------------------------------------------------------------

/// `credit_card_meta` 테이블 한 행. 평문 비밀(카드번호·CVC)은 포함하지 않는다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreditCardMeta {
    pub credential_id: CredentialId,
    pub brand: CardBrand,
    /// 월 1–12.
    pub expiry_month: u8,
    /// 연도 2024+.
    pub expiry_year: u16,
    pub cardholder_name: Option<String>,
    /// 선택 청구주소 (GATE 2-5).
    pub billing_address: Option<String>,
    /// 카드 마지막 4자리 — Amex 포함 (B.5-3).
    pub last_4: String,
}

// ---------------------------------------------------------------------------
// CreditCardSummary — Frontend 리스트 뷰 전달용
// ---------------------------------------------------------------------------

/// Frontend 리스트 뷰에 전달하는 요약. 평문 카드번호 / CVC / PIN 미포함 (B.1-3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreditCardSummary {
    pub credential_id: CredentialId,
    pub brand: CardBrand,
    pub expiry_month: u8,
    pub expiry_year: u16,
    pub cardholder_name: Option<String>,
    pub last_4: String,
    // ⚠️ 평문 카드번호 ❌  CVC ❌  PIN ❌ — 구조체 정의 자체로 강제
}

// ---------------------------------------------------------------------------
// CreditCardSecret — vault 저장/로드 시 사용
// ---------------------------------------------------------------------------

/// Vault 저장·로드 시 사용하는 비밀 컨테이너.
///
/// `SecretBox<String>` 으로 래핑하여 Drop 시 자동 zeroize (B.5-1).
/// `Debug` / `Clone` / `Serialize` 미구현 — 실수로 로그·직렬화 불가.
pub struct CreditCardSecret {
    pub card_number: SecretBox<String>,
    pub cvc: SecretBox<String>,
    // PIN 은 GATE 2-6 결정에 따라 Phase 3-B/4 로 미룸.
}

// ---------------------------------------------------------------------------
// CreditCardInput — Frontend → backend 등록 입력
// ---------------------------------------------------------------------------

/// Frontend → backend 신용카드 등록 입력.
///
/// ⚠️ `card_number_plain` / `cvc_plain` 은 IPC 통과 시 평문으로 전달된다.
/// backend(`add_credit_card` command, Phase 3-A-5)가 수신 즉시 `SecretBox` 래핑 →
/// age vault 저장 → `CreditCardInput` drop 의 순서를 보장해야 한다.
/// frontend 는 전송 직후 폼 state 를 클리어해야 한다 (3-A-4 implementator 의무).
///
/// `PartialEq` 미구현 — 평문 카드번호 비교는 의도하지 않는다.
/// `Clone` 미구현 — 복제로 인한 평문 복사를 방지한다.
#[derive(Debug, Serialize, Deserialize)]
pub struct CreditCardInput {
    pub issuer_id: IssuerId,
    pub name: String,
    pub brand: CardBrand,
    pub expiry_month: u8,
    pub expiry_year: u16,
    pub cardholder_name: Option<String>,
    pub billing_address: Option<String>,
    pub last_4: String,
    /// ⚠️ 평문 카드번호 — backend 수신 즉시 SecretBox 래핑 후 vault 저장.
    pub card_number_plain: String,
    /// ⚠️ 평문 CVC — 동일 처리.
    pub cvc_plain: String,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // CB1: CardBrand serde — Visa → "visa"
    #[test]
    fn cb1_card_brand_serde_visa() {
        let json = serde_json::to_string(&CardBrand::Visa).unwrap();
        assert_eq!(json, r#""visa""#);
        let back: CardBrand = serde_json::from_str(&json).unwrap();
        assert_eq!(back, CardBrand::Visa);
    }

    // CB1 extended: 7 variant 모두 serde lowercase 확인
    #[test]
    fn cb1_all_variants_lowercase_serde() {
        let cases = [
            (CardBrand::Visa, "visa"),
            (CardBrand::Mastercard, "mastercard"),
            (CardBrand::Amex, "amex"),
            (CardBrand::Discover, "discover"),
            (CardBrand::Jcb, "jcb"),
            (CardBrand::Diners, "diners"),
            (CardBrand::Unknown, "unknown"),
        ];
        for (brand, expected) in cases {
            let json = serde_json::to_string(&brand).unwrap();
            assert_eq!(json, format!(r#""{expected}""#), "brand={brand:?}");
            assert_eq!(brand.as_str(), expected, "as_str brand={brand:?}");
        }
    }

    // CB2: from_str_safe — "VISA" → Unknown (case-sensitive 보수적 처리)
    #[test]
    fn cb2_from_str_safe_case_sensitive() {
        assert_eq!(CardBrand::from_str_safe("VISA"), CardBrand::Unknown);
        assert_eq!(CardBrand::from_str_safe("Mastercard"), CardBrand::Unknown);
        assert_eq!(CardBrand::from_str_safe("visa"), CardBrand::Visa);
        assert_eq!(
            CardBrand::from_str_safe("mastercard"),
            CardBrand::Mastercard
        );
        assert_eq!(CardBrand::from_str_safe(""), CardBrand::Unknown);
    }

    // CC1: CredentialKind::CreditCard serde → "credit_card"
    #[test]
    fn cc1_credential_kind_credit_card_serde() {
        use crate::models::credential::CredentialKind;
        let json = serde_json::to_string(&CredentialKind::CreditCard).unwrap();
        assert_eq!(json, r#""credit_card""#);
        let back: CredentialKind = serde_json::from_str(&json).unwrap();
        assert_eq!(back, CredentialKind::CreditCard);
    }

    // CC2: CredentialKind::CreditCard 가 ApiKey / Password 와 호환 (기존 variant 회귀)
    #[test]
    fn cc2_existing_kinds_unaffected() {
        use crate::models::credential::CredentialKind;
        let api_key_json = serde_json::to_string(&CredentialKind::ApiKey).unwrap();
        assert_eq!(api_key_json, r#""api_key""#);
        let password_json = serde_json::to_string(&CredentialKind::Password).unwrap();
        assert_eq!(password_json, r#""password""#);
    }

    // CreditCardMeta 구조체 기본 생성 / PartialEq 확인
    #[test]
    fn credit_card_meta_equality() {
        let id = CredentialId::new();
        let meta = CreditCardMeta {
            credential_id: id,
            brand: CardBrand::Visa,
            expiry_month: 12,
            expiry_year: 2028,
            cardholder_name: Some("Alice".to_string()),
            billing_address: None,
            last_4: "4242".to_string(),
        };
        let meta2 = meta.clone();
        assert_eq!(meta, meta2);
    }

    // CreditCardSummary — 평문 카드번호 필드 부재 확인 (구조적 보장)
    #[test]
    fn credit_card_summary_no_secret_fields() {
        let id = CredentialId::new();
        let summary = CreditCardSummary {
            credential_id: id,
            brand: CardBrand::Mastercard,
            expiry_month: 6,
            expiry_year: 2027,
            cardholder_name: None,
            last_4: "1234".to_string(),
        };
        let json = serde_json::to_value(&summary).unwrap();
        // card_number / cvc / pin 키가 JSON 에 없음을 확인
        assert!(json.get("card_number").is_none());
        assert!(json.get("cvc").is_none());
        assert!(json.get("pin").is_none());
    }
}
