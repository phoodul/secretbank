// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// Secretbank Native Messaging Host 진입점.
//
// Chrome/Firefox Native Messaging 프로토콜로 브라우저 확장과 통신한다.
// stdin → 메시지 읽기 → 처리 → stdout 출력.
//
// 주의: stdout 은 프로토콜 프레임 전용. 로그/panic 은 stderr 만 사용.
//       `println!` / `print!` / `dbg!` 절대 금지.

use secretbank_nm_host::protocol;
use tracing::{error, info};

#[tokio::main]
async fn main() {
    // panic hook: backtrace 를 stderr 로만 출력 후 exit code 1
    // (stdout 오염 방지 — stdout 은 프로토콜 프레임 전용)
    std::panic::set_hook(Box::new(|info| {
        eprintln!("nm-host panic: {info}");
        std::process::exit(1);
    }));

    // tracing subscriber: stderr 전용 출력 (stdout 오염 금지)
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Secretbank Native Messaging Host 시작");

    // stdin/stdout 비동기 핸들
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let mut reader = tokio::io::BufReader::new(stdin);
    let mut writer = tokio::io::BufWriter::new(stdout);

    // 이벤트 루프: stdin 메시지 수신 또는 ctrl-c 신호 처리
    loop {
        tokio::select! {
            // (a) stdin 에서 메시지 읽기
            result = protocol::read_message(&mut reader) => {
                match result {
                    Ok(None) => {
                        // Extension 이 disconnect — graceful shutdown
                        info!("stdin EOF — extension 이 연결을 종료했습니다. 정상 종료.");
                        break;
                    }
                    Ok(Some(msg)) => {
                        // B-3 에서 실제 라우팅 구현 예정. 현재는 echo (ack) 반환.
                        let response = process_message(msg);
                        if let Err(e) = protocol::write_message(&mut writer, &response).await {
                            error!("응답 쓰기 실패: {e}");
                            break;
                        }
                    }
                    Err(e) => {
                        error!("메시지 읽기 오류: {e}");
                        break;
                    }
                }
            }

            // (b) Ctrl-C 신호 수신 — graceful shutdown
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl-C 수신 — 정상 종료합니다.");
                break;
            }
        }
    }

    info!("Secretbank Native Messaging Host 종료");
}

/// 메시지 처리 함수 (placeholder — B-3 에서 실제 라우팅으로 교체 예정)
///
/// 현재는 수신 메시지를 그대로 ack 래퍼로 감싸 반환한다.
fn process_message(msg: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "status": "ok",
        "echo": msg
    })
}
