// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// Native Messaging 프로토콜 구현.
//
// 프레임 형식:
//   [4 bytes, little-endian u32 = body byte length] [body: UTF-8 JSON]
//
// 참조: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging#native-messaging-host-protocol
//
// 주의: stdout 오염 절대 금지. 이 모듈의 모든 출력은 프로토콜 프레임 또는 없음.
//       `println!` / `print!` / `dbg!` 사용 금지.

use std::io;
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Native Messaging 메시지 크기 상한 — 1 MiB (양방향 동일, Chrome 표준 준수)
pub const MAX_MESSAGE_SIZE: usize = 1_048_576; // 1 MiB

/// 프로토콜 에러 종류
#[derive(Debug, Error)]
pub enum ProtocolError {
    /// 메시지 크기가 상한(1 MiB)을 초과했다
    #[error("메시지 크기 {size} bytes 가 상한 {MAX_MESSAGE_SIZE} bytes 를 초과했습니다")]
    TooLarge { size: usize },

    /// body 가 유효한 UTF-8 이 아니다
    #[error("메시지 body 가 유효한 UTF-8 이 아닙니다: {source}")]
    InvalidUtf8 {
        #[source]
        source: std::string::FromUtf8Error,
    },

    /// body 가 유효한 JSON 이 아니다
    #[error("메시지 body JSON 파싱 오류: {0}")]
    Json(#[from] serde_json::Error),

    /// 입출력 에러
    #[error("I/O 오류: {0}")]
    Io(#[from] io::Error),
}

/// stdin 에서 Native Messaging 메시지 한 프레임을 읽어 JSON Value 를 반환한다.
///
/// EOF 시 `None` 반환 (extension disconnect = graceful shutdown 신호).
///
/// # 오류
/// - [`ProtocolError::TooLarge`] — length header 값이 1 MiB 초과
/// - [`ProtocolError::InvalidUtf8`] — body 가 UTF-8 아님
/// - [`ProtocolError::Json`] — body 가 JSON 아님
/// - [`ProtocolError::Io`] — 실제 I/O 에러
pub async fn read_message<R>(reader: &mut R) -> Result<Option<serde_json::Value>, ProtocolError>
where
    R: AsyncReadExt + Unpin,
{
    // 4-byte little-endian length header 읽기
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => {
            // Extension 이 disconnect 했다 — graceful shutdown
            return Ok(None);
        }
        Err(e) => return Err(ProtocolError::Io(e)),
    }

    let body_len = u32::from_le_bytes(len_buf) as usize;

    // 1 MiB 상한 검사
    if body_len > MAX_MESSAGE_SIZE {
        return Err(ProtocolError::TooLarge { size: body_len });
    }

    // body 읽기 (0바이트도 허용 — 빈 JSON null 과 같은 케이스)
    let mut body_buf = vec![0u8; body_len];
    if body_len > 0 {
        reader.read_exact(&mut body_buf).await.map_err(|e| {
            if e.kind() == io::ErrorKind::UnexpectedEof {
                ProtocolError::Io(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "body 읽기 중 예상치 못한 EOF",
                ))
            } else {
                ProtocolError::Io(e)
            }
        })?;
    }

    // UTF-8 검증
    let body_str =
        String::from_utf8(body_buf).map_err(|e| ProtocolError::InvalidUtf8 { source: e })?;

    // JSON 파싱
    let value = serde_json::from_str(&body_str)?;

    Ok(Some(value))
}

/// stdout 에 Native Messaging 메시지 한 프레임을 쓴다.
///
/// 직렬화 → length header(4-byte LE) → body 순으로 write 후 flush.
///
/// # 오류
/// - [`ProtocolError::TooLarge`] — 직렬화된 body 가 1 MiB 초과
/// - [`ProtocolError::Json`] — 직렬화 실패
/// - [`ProtocolError::Io`] — I/O 에러
pub async fn write_message<W>(writer: &mut W, msg: &serde_json::Value) -> Result<(), ProtocolError>
where
    W: AsyncWriteExt + Unpin,
{
    // JSON 직렬화
    let body = serde_json::to_vec(msg)?;

    // 1 MiB 상한 검사
    if body.len() > MAX_MESSAGE_SIZE {
        return Err(ProtocolError::TooLarge { size: body.len() });
    }

    // length header (4-byte LE u32)
    let len = body.len() as u32;
    writer.write_all(&len.to_le_bytes()).await?;

    // body
    writer.write_all(&body).await?;
    writer.flush().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::BufReader;

    /// 단일 메시지 encode → decode round-trip 검증
    async fn roundtrip(value: serde_json::Value) -> serde_json::Value {
        let mut buf: Vec<u8> = Vec::new();
        write_message(&mut buf, &value)
            .await
            .expect("write 성공해야 함");

        let mut reader = BufReader::new(buf.as_slice());
        read_message(&mut reader)
            .await
            .expect("read 성공해야 함")
            .expect("EOF 없어야 함")
    }

    #[tokio::test]
    async fn test_roundtrip_string() {
        let v = json!("hello world");
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_number() {
        let v = json!(42);
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_null() {
        let v = json!(null);
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_bool() {
        assert_eq!(roundtrip(json!(true)).await, json!(true));
        assert_eq!(roundtrip(json!(false)).await, json!(false));
    }

    #[tokio::test]
    async fn test_roundtrip_object() {
        let v = json!({ "type": "ping", "id": 1, "payload": { "key": "value" } });
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_array() {
        let v = json!([1, 2, 3, "four", null]);
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_unicode() {
        let v = json!({ "msg": "안녕하세요 🦀" });
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_roundtrip_1byte_body() {
        // "0" 은 1바이트 JSON
        let v = json!(0);
        assert_eq!(roundtrip(v.clone()).await, v);
    }

    #[tokio::test]
    async fn test_boundary_exact_1mb() {
        // 정확히 1 MiB 크기 문자열 — 허용되어야 한다
        // JSON 문자열 형식: `"<content>"` → 따옴표 2바이트를 제외한 content 크기
        let content_len = MAX_MESSAGE_SIZE - 2; // 따옴표 2바이트 제외
        let content = "a".repeat(content_len);
        let v = serde_json::Value::String(content);

        let mut buf: Vec<u8> = Vec::new();
        write_message(&mut buf, &v)
            .await
            .expect("1MB 정확히는 허용");

        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let decoded = read_message(&mut reader)
            .await
            .expect("read 성공")
            .expect("EOF 없음");
        assert_eq!(decoded, v);
    }

    #[tokio::test]
    async fn test_too_large_on_write() {
        // 직렬화 결과가 1 MiB 초과하면 TooLarge 에러
        let content_len = MAX_MESSAGE_SIZE; // 따옴표 포함하면 초과
        let content = "a".repeat(content_len);
        let v = serde_json::Value::String(content);

        let mut buf: Vec<u8> = Vec::new();
        let err = write_message(&mut buf, &v).await.unwrap_err();
        assert!(matches!(err, ProtocolError::TooLarge { .. }));
    }

    #[tokio::test]
    async fn test_too_large_on_read() {
        // length header 가 1 MiB 초과하면 TooLarge 에러 (body 읽기 전 거부)
        let over_limit = (MAX_MESSAGE_SIZE + 1) as u32;
        let mut buf = over_limit.to_le_bytes().to_vec();
        // body 는 실제로 없어도 됨 — header 검사에서 거부
        buf.extend(vec![0u8; 10]);

        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let err = read_message(&mut reader).await.unwrap_err();
        assert!(matches!(err, ProtocolError::TooLarge { .. }));
    }

    #[tokio::test]
    async fn test_invalid_utf8_on_read() {
        // 0xFF 0xFE — 유효한 UTF-8 아님
        let invalid_body: Vec<u8> = vec![0xFF, 0xFE];
        let len = invalid_body.len() as u32;
        let mut buf = len.to_le_bytes().to_vec();
        buf.extend(invalid_body);

        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let err = read_message(&mut reader).await.unwrap_err();
        assert!(matches!(err, ProtocolError::InvalidUtf8 { .. }));
    }

    #[tokio::test]
    async fn test_invalid_json_on_read() {
        // 유효한 UTF-8 이지만 JSON 이 아님
        let body = b"not json {{{";
        let len = body.len() as u32;
        let mut buf = len.to_le_bytes().to_vec();
        buf.extend_from_slice(body);

        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let err = read_message(&mut reader).await.unwrap_err();
        assert!(matches!(err, ProtocolError::Json(_)));
    }

    #[tokio::test]
    async fn test_eof_returns_none() {
        // 빈 스트림 = extension disconnect = None
        let buf: Vec<u8> = Vec::new();
        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let result = read_message(&mut reader).await.expect("에러 없어야 함");
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_zero_byte_body() {
        // length = 0 → 빈 body → JSON 파싱 오류 (빈 문자열은 유효한 JSON 아님)
        let len: u32 = 0;
        let buf = len.to_le_bytes().to_vec();

        let mut reader = tokio::io::BufReader::new(buf.as_slice());
        let err = read_message(&mut reader).await.unwrap_err();
        // 빈 문자열은 JSON 파싱 실패
        assert!(matches!(err, ProtocolError::Json(_)));
    }
}
