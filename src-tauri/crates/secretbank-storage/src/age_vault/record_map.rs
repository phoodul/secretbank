//! 볼트 레코드 맵 직렬화/역직렬화 (MessagePack via rmp-serde).
//!
//! 내부 데이터 구조: `HashMap<String, Vec<u8>>`
//! - key: 비밀 경로 (예: "openai/production/key")
//! - value: 비밀 값 원시 바이트 (plaintext in memory, encrypted on disk)
//!
//! MessagePack 을 선택한 이유:
//! - JSON 보다 크기가 작음 (바이너리 친화적)
//! - 이미 `Vec<u8>` 값을 가지므로 base64 인코딩 불필요
//! - rmp-serde 가 serde Deserialize/Serialize 를 구현하므로 코드가 단순함

use std::collections::HashMap;

use crate::vault::VaultError;

/// `HashMap<String, Vec<u8>>` 를 MessagePack 바이트 스트림으로 직렬화한다.
///
/// 직렬화 결과는 age Encryptor 의 payload 로 투입된다.
pub fn serialize(map: &HashMap<String, Vec<u8>>) -> Result<Vec<u8>, VaultError> {
    rmp_serde::to_vec(map).map_err(|e| VaultError::Serialization(e.to_string()))
}

/// MessagePack 바이트 스트림을 `HashMap<String, Vec<u8>>` 으로 역직렬화한다.
///
/// age Decryptor 의 복호화 결과를 인수로 받는다.
pub fn deserialize(bytes: &[u8]) -> Result<HashMap<String, Vec<u8>>, VaultError> {
    rmp_serde::from_slice(bytes).map_err(|e| VaultError::Serialization(e.to_string()))
}
