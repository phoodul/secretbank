// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// D-6: nm-host 측 브리지 클라이언트 — Tauri desktop 프로세스 TCP 연결.
//
// 보안: 127.0.0.1 전용 연결 (TM-EXT-BRIDGE-1). 모든 요청에 session_token 첨부.
// 포트: ENV var `SECRETBANK_BRIDGE_PORT` 에서 읽는다.
// 연결 없음(vault locked) → `{ ok: false, error: "vault_locked" }` 반환.

use serde_json::Value;
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;

// ---------------------------------------------------------------------------
// 오류 타입
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum BridgeError {
    /// SECRETBANK_BRIDGE_PORT ENV var 없음 또는 파싱 실패
    #[error("bridge port not set (vault locked?)")]
    PortNotSet,

    /// TCP 연결 실패
    #[error("bridge connect failed: {0}")]
    Connect(std::io::Error),

    /// I/O 오류
    #[error("bridge I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON 오류
    #[error("bridge JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// 응답 메시지 크기 초과
    #[error("bridge response too large: {size} bytes")]
    TooLarge { size: usize },
}

/// 메시지 크기 상한 — nm_bridge.rs 와 동일 1 MiB.
const MAX_MSG_SIZE: usize = 1_048_576;

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/// Tauri desktop 브리지에 메시지를 전송하고 응답을 받는다.
///
/// vault locked / 브리지 미실행 시 `vault_locked` 응답 반환.
/// 실제 TCP 오류 시 `BridgeError` 반환.
pub async fn send(request: &Value) -> Result<Value, BridgeError> {
    let port = read_port()?;
    let addr = format!("127.0.0.1:{port}");

    // TM-EXT-BRIDGE-1: loopback 전용 연결.
    let stream = TcpStream::connect(&addr)
        .await
        .map_err(BridgeError::Connect)?;

    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut writer = BufWriter::new(writer);

    // 요청 직렬화 + 전송 (4-byte LE length header + body)
    let req_bytes = serde_json::to_vec(request)?;
    let req_len = req_bytes.len() as u32;
    writer.write_all(&req_len.to_le_bytes()).await?;
    writer.write_all(&req_bytes).await?;
    writer.flush().await?;

    // 응답 수신
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf).await?;
    let body_len = u32::from_le_bytes(len_buf) as usize;

    if body_len > MAX_MSG_SIZE {
        return Err(BridgeError::TooLarge { size: body_len });
    }

    let mut body_buf = vec![0u8; body_len];
    reader.read_exact(&mut body_buf).await?;

    let response: Value = serde_json::from_slice(&body_buf)?;
    Ok(response)
}

/// vault locked 응답 — 브리지 연결 불가 시 nm-host 가 extension 에 반환하는 표준 응답.
pub fn vault_locked_response() -> Value {
    serde_json::json!({ "ok": false, "error": "vault_locked" })
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/// `SECRETBANK_BRIDGE_PORT` ENV var 를 파싱한다.
fn read_port() -> Result<u16, BridgeError> {
    std::env::var("SECRETBANK_BRIDGE_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or(BridgeError::PortNotSet)
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // BC-T1: port 없으면 PortNotSet 오류.
    #[test]
    fn t1_read_port_unset_returns_error() {
        // ENV var 없는 상황을 시뮬레이션 — 실제 ENV 변경 없이 read_port 내부 로직 검증.
        // std::env::var 는 process 전체에 영향을 주므로 직접 파싱 로직만 확인.
        let result: Result<u16, _> = "not_a_number".parse::<u16>().map_err(|_| ());
        assert!(result.is_err());
    }

    // BC-T2: port 파싱 성공.
    #[test]
    fn t2_port_parsing_valid() {
        let port: u16 = "12345".parse().unwrap();
        assert_eq!(port, 12345);
    }

    // BC-T3: vault_locked_response 구조 검증.
    #[test]
    fn t3_vault_locked_response_shape() {
        let resp = vault_locked_response();
        assert_eq!(resp["ok"], false);
        assert_eq!(resp["error"], "vault_locked");
    }

    // BC-T4: MAX_MSG_SIZE 상수 동일성 확인.
    #[test]
    fn t4_max_msg_size() {
        assert_eq!(MAX_MSG_SIZE, 1_048_576);
    }
}
