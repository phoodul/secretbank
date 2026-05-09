//! Tamper-evident audit log (hash chain + ed25519).
//!
//! 각 엔트리는 (seq, payload, prev_hash, created_at) 를 바이트 시퀀스로 정규화해
//! SHA-256 해시 + ed25519 서명한다. `verify()` 는 체인 전체 재계산으로 변조 여부를
//! 탐지하고 첫 어긋난 seq 를 반환한다.

pub mod actions;
mod chain;
mod types;

pub use chain::{append, verify, AuditError, ChainVerification, GENESIS_PREV_HASH};
pub use types::{AuditActor, AuditInput, AuditLog};
