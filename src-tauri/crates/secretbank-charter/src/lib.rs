//! Vault Charter — recovery 코덱 + Shamir 분할 + envelope.
//!
//! 4 차별화 축을 한 crate 에:
//!
//! 1. **컨셉**: "Vault Charter" — 1Password Emergency Kit 와 다른 봉인 헌장 메타포.
//! 2. **포맷**: Diceware 6 단어 + 4-digit verifier (entropy 약 77.55 bit + 한 단어 오타 즉시 감지).
//! 3. **분할**: Shamir 2-of-3 — 한 장 분실해도 vault 살아남음.
//! 4. **알림 hook**: envelope 모듈은 unwrap 시점 callback 노출 (백엔드가 sync 알림 emit).

pub mod charter;
pub mod envelope;
pub mod shamir;
pub mod wordlist;

pub use charter::{Charter, CharterError, CharterSecret};
pub use envelope::{unwrap_enc_key, wrap_enc_key, EnvelopeError, WrappedKey};
pub use shamir::{shamir_combine, shamir_split, ShamirError, ShamirShare};
