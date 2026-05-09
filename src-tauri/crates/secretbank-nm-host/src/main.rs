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
//
// CLI 서브커맨드 (NM 모드 외):
//   --install [--ext-id <ID>]   : NM host manifest 를 OS 표준 경로에 등록
//   --uninstall                 : 등록 해제
//   --status                    : 현재 등록 상태 출력 (stdout — 의도적 표시)
//
// TODO(Phase-F): --ext-id 기본값은 placeholder. Web Store 등록 후 실 ID 로 교체.

use secretbank_nm_host::installer::{self, Browser};
use secretbank_nm_host::protocol;
use tracing::{error, info};

/// --install / --uninstall / --status 가 없으면 NM 모드로 동작한다.
#[derive(Debug)]
enum CliMode {
    /// Chrome/Firefox Native Messaging 이벤트 루프 (기본)
    NativeMessaging,
    /// NM host 등록 (`--install [--ext-id <ID>]`)
    Install { ext_id: String },
    /// NM host 등록 해제 (`--uninstall`)
    Uninstall,
    /// 현재 등록 상태 출력 (`--status`)
    Status,
}

/// args 를 파싱하여 [`CliMode`] 를 결정한다.
///
/// 단순 std::env::args() 매칭 — clap 의존성 없음 (binary size 절약).
fn parse_args() -> CliMode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut iter = args.iter().peekable();

    // 첫 번째 인수로 모드 결정
    match iter.next().map(String::as_str) {
        Some("--install") => {
            // --ext-id <ID> 파싱 (선택 — 없으면 placeholder 사용)
            // TODO(Phase-F): Web Store 등록 후 기본값을 실제 ID 로 교체.
            let mut ext_id = "placeholder_ext_id".to_string();
            while let Some(arg) = iter.next() {
                if arg == "--ext-id" {
                    if let Some(id) = iter.next() {
                        ext_id = id.clone();
                    }
                }
            }
            CliMode::Install { ext_id }
        }
        Some("--uninstall") => CliMode::Uninstall,
        Some("--status") => CliMode::Status,
        _ => CliMode::NativeMessaging,
    }
}

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

    // CLI 모드 분기 — NM 모드 외 서브커맨드 처리
    match parse_args() {
        CliMode::Install { ext_id } => {
            run_install(&ext_id);
        }
        CliMode::Uninstall => {
            run_uninstall();
        }
        CliMode::Status => {
            run_status();
        }
        CliMode::NativeMessaging => {
            info!("Secretbank Native Messaging Host 시작");
            run_nm_loop().await;
            info!("Secretbank Native Messaging Host 종료");
        }
    }
}

/// NM host manifest 를 모든 지원 브라우저에 등록한다.
///
/// 결과는 stderr 로만 출력 (stdout 오염 방지).
fn run_install(ext_id: &str) {
    let mut any_ok = false;
    let mut any_err = false;

    for &browser in Browser::all() {
        match installer::install(browser, ext_id, None) {
            Ok(()) => {
                eprintln!(
                    "[install] {} 등록 완료: {}",
                    browser.name(),
                    installer::manifest_path(browser)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| "경로 불명".to_string())
                );
                any_ok = true;
            }
            Err(e) => {
                eprintln!("[install] {} 등록 실패: {e}", browser.name());
                any_err = true;
            }
        }
    }

    if any_ok && !any_err {
        eprintln!("[install] 모든 브라우저 등록 완료.");
    } else if any_err {
        eprintln!("[install] 일부 브라우저 등록 실패. 위 오류를 확인하세요.");
        std::process::exit(1);
    }
}

/// NM host manifest 등록을 모든 지원 브라우저에서 해제한다.
///
/// 결과는 stderr 로만 출력 (stdout 오염 방지).
fn run_uninstall() {
    let mut any_err = false;

    for &browser in Browser::all() {
        match installer::uninstall(browser) {
            Ok(()) => {
                eprintln!("[uninstall] {} 등록 해제 완료.", browser.name());
            }
            Err(e) => {
                eprintln!("[uninstall] {} 등록 해제 실패: {e}", browser.name());
                any_err = true;
            }
        }
    }

    if any_err {
        std::process::exit(1);
    }
}

/// 현재 등록 상태를 stdout 으로 출력한다 (사용자 의도적 표시).
///
/// NM 모드가 아닌 상태에서만 호출되므로 stdout 오염 아님.
fn run_status() {
    for &browser in Browser::all() {
        let installed = installer::is_installed(browser);
        let path = installer::manifest_path(browser)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "경로 불명".to_string());
        println!(
            "{}: {} ({})",
            browser.name(),
            if installed { "등록됨" } else { "미등록" },
            path
        );
    }
}

/// Native Messaging 이벤트 루프 (기본 모드).
async fn run_nm_loop() {
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
