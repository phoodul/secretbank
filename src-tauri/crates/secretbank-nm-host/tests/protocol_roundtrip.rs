// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// Native Messaging 프로토콜 통합 테스트.
// Vec<u8> reader/writer 로 stdio 를 모킹하여 encode → decode 전 사이클을 검증한다.

use secretbank_nm_host::protocol::{self, MAX_MESSAGE_SIZE};
use serde_json::json;

// ── 헬퍼: Vec<u8> 버퍼에 write → 같은 버퍼에서 read ────────────────────────

async fn encode_then_decode(value: serde_json::Value) -> serde_json::Value {
    let mut buf: Vec<u8> = Vec::new();
    protocol::write_message(&mut buf, &value)
        .await
        .expect("write 성공해야 함");

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    protocol::read_message(&mut reader)
        .await
        .expect("read 성공해야 함")
        .expect("EOF 없어야 함")
}

// ── Round-trip 테스트 ────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_roundtrip_string() {
    let v = json!("secretbank native messaging host");
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_number_int() {
    let v = json!(999999);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_number_float() {
    let v = json!(3.14);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_null() {
    let v = json!(null);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_bool_true() {
    let v = json!(true);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_bool_false() {
    let v = json!(false);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_complex_object() {
    let v = json!({
        "type": "vault.list",
        "id": "01HZ4GK2NQ5V2EQ3BFXW8JYVG",
        "payload": {
            "filter": "api_key",
            "limit": 50,
            "tags": ["production", "stripe"],
            "nested": { "deep": true }
        }
    });
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_array() {
    let v = json!([
        { "id": 1, "name": "STRIPE_SECRET" },
        { "id": 2, "name": "GITHUB_TOKEN" },
        null,
        42,
        "extra"
    ]);
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

#[tokio::test]
async fn integration_roundtrip_unicode_korean() {
    let v = json!({ "message": "안녕하세요, Secretbank!", "emoji": "🦀🔐" });
    assert_eq!(encode_then_decode(v.clone()).await, v);
}

// ── 연속 메시지 (다중 프레임) ────────────────────────────────────────────────

#[tokio::test]
async fn integration_multiple_messages_sequential() {
    let messages = vec![
        json!({ "seq": 1, "type": "ping" }),
        json!({ "seq": 2, "type": "vault.list" }),
        json!({ "seq": 3, "type": "disconnect" }),
    ];

    // 모든 메시지를 하나의 버퍼에 순차 write
    let mut buf: Vec<u8> = Vec::new();
    for msg in &messages {
        protocol::write_message(&mut buf, msg)
            .await
            .expect("write 성공");
    }

    // 같은 버퍼에서 순차 read — 순서와 내용이 일치해야 한다
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    for expected in &messages {
        let decoded = protocol::read_message(&mut reader)
            .await
            .expect("read 성공")
            .expect("EOF 없어야 함");
        assert_eq!(&decoded, expected);
    }

    // 버퍼 소진 후 EOF → None
    let eof = protocol::read_message(&mut reader)
        .await
        .expect("에러 없어야 함");
    assert!(eof.is_none(), "버퍼 소진 후 EOF(None) 이어야 한다");
}

// ── 경계 케이스 ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_boundary_exact_1mb() {
    // 정확히 1 MiB JSON 문자열 — 허용되어야 한다
    // JSON 문자열 = `"` + content + `"` → 따옴표 2바이트 제외
    let content_len = MAX_MESSAGE_SIZE - 2;
    let v = serde_json::Value::String("x".repeat(content_len));

    let mut buf: Vec<u8> = Vec::new();
    protocol::write_message(&mut buf, &v)
        .await
        .expect("1 MiB 정확히는 허용");

    // 프레임 크기 확인: 4 (header) + 1_048_576 (body)
    assert_eq!(buf.len(), 4 + MAX_MESSAGE_SIZE);

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded = protocol::read_message(&mut reader)
        .await
        .expect("read 성공")
        .expect("EOF 없음");
    assert_eq!(decoded, v);
}

#[tokio::test]
async fn integration_boundary_1byte_body() {
    // 단일 숫자 "0" — body 1바이트
    let v = json!(0);
    let mut buf: Vec<u8> = Vec::new();
    protocol::write_message(&mut buf, &v)
        .await
        .expect("write 성공");

    // 4바이트 header + 1바이트 body = 5바이트
    assert_eq!(buf.len(), 5);

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded = protocol::read_message(&mut reader)
        .await
        .expect("read 성공")
        .expect("EOF 없음");
    assert_eq!(decoded, v);
}

// ── 잘못된 프레임 거부 ───────────────────────────────────────────────────────

#[tokio::test]
async fn integration_reject_too_large_on_write() {
    // 직렬화 후 body 가 1 MiB 를 초과하면 TooLarge
    let content_len = MAX_MESSAGE_SIZE; // 따옴표 포함 시 1_048_578 bytes
    let v = serde_json::Value::String("y".repeat(content_len));

    let mut buf: Vec<u8> = Vec::new();
    let err = protocol::write_message(&mut buf, &v).await.unwrap_err();
    assert!(
        matches!(err, protocol::ProtocolError::TooLarge { .. }),
        "TooLarge 이어야 한다: {err:?}"
    );
}

#[tokio::test]
async fn integration_reject_too_large_on_read() {
    // length header 가 1 MiB + 1 — body 읽기 전 즉시 거부
    let over_limit = (MAX_MESSAGE_SIZE + 1) as u32;
    let mut buf = over_limit.to_le_bytes().to_vec();
    buf.extend(vec![0u8; 16]); // 실제 body 는 짧아도 됨 — header 에서 거부

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let err = protocol::read_message(&mut reader).await.unwrap_err();
    assert!(
        matches!(err, protocol::ProtocolError::TooLarge { .. }),
        "TooLarge 이어야 한다: {err:?}"
    );
}

#[tokio::test]
async fn integration_reject_invalid_utf8() {
    // 0xFF 0xFE — 유효한 UTF-8 아님
    let invalid_body: Vec<u8> = vec![0xFF, 0xFE, 0x80];
    let len = invalid_body.len() as u32;
    let mut buf = len.to_le_bytes().to_vec();
    buf.extend(invalid_body);

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let err = protocol::read_message(&mut reader).await.unwrap_err();
    assert!(
        matches!(err, protocol::ProtocolError::InvalidUtf8 { .. }),
        "InvalidUtf8 이어야 한다: {err:?}"
    );
}

#[tokio::test]
async fn integration_reject_invalid_json() {
    // 유효한 UTF-8 이지만 JSON 이 아님
    let body = b"{ invalid json ]]]";
    let len = body.len() as u32;
    let mut buf = len.to_le_bytes().to_vec();
    buf.extend_from_slice(body);

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let err = protocol::read_message(&mut reader).await.unwrap_err();
    assert!(
        matches!(err, protocol::ProtocolError::Json(_)),
        "Json 에러 이어야 한다: {err:?}"
    );
}

#[tokio::test]
async fn integration_eof_on_empty_stream() {
    // 빈 스트림 = extension disconnect = None (에러 아님)
    let buf: Vec<u8> = Vec::new();
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let result = protocol::read_message(&mut reader)
        .await
        .expect("에러 없어야 함");
    assert!(result.is_none(), "빈 스트림은 None 이어야 한다");
}

#[tokio::test]
async fn integration_zero_length_body_is_error() {
    // length = 0 → 빈 문자열 → JSON 파싱 실패
    let len: u32 = 0;
    let buf = len.to_le_bytes().to_vec();

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let err = protocol::read_message(&mut reader).await.unwrap_err();
    assert!(
        matches!(err, protocol::ProtocolError::Json(_)),
        "빈 body 는 Json 에러 이어야 한다: {err:?}"
    );
}

#[tokio::test]
async fn integration_frame_header_correctness() {
    // length header 값이 body 바이트 길이와 일치하는지 직접 검증
    let v = json!({ "check": "header" });
    let mut buf: Vec<u8> = Vec::new();
    protocol::write_message(&mut buf, &v)
        .await
        .expect("write 성공");

    // 첫 4바이트가 나머지 body 길이와 일치해야 한다
    let header = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
    let body_len = buf.len() - 4;
    assert_eq!(
        header, body_len,
        "length header 가 body 길이와 일치해야 한다"
    );
}
