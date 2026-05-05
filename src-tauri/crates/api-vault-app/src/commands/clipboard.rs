//! Tauri 커맨드: 클립보드 복사 + 30초 자동 만료 (T023).
//!
//! # 흐름
//! 1. `credential_copy_to_clipboard(id)` 호출 →  볼트에서 평문 조회
//! 2. `tauri_plugin_clipboard_manager`로 클립보드에 쓰기
//! 3. 평문은 즉시 drop
//! 4. `tokio::spawn`으로 30초 카운트다운 타이머 시작
//!    - 1초마다 `clipboard:countdown { remaining }` 이벤트 emit
//!    - 30초 후 클립보드를 빈 문자열로 덮어쓰고 `remaining: 0` 이벤트 emit
//! 5. 이전 타이머가 있으면 `.abort()` 로 취소 후 새 타이머로 교체
//!
//! 이 모듈은 `tauri-plugins` feature 가 켜진 빌드에서만 컴파일된다.

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use api_vault_core::CredentialId;

use crate::commands::credentials::{reveal_secret, CredentialCommandError, RevealSlot};
use crate::context::AppContext;

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/// 클립보드 자동 만료까지 대기하는 시간.
const CLIPBOARD_EXPIRY: Duration = Duration::from_secs(30);

/// 카운트다운 이벤트 발행 간격.
const TICK_INTERVAL: Duration = Duration::from_secs(1);

// ---------------------------------------------------------------------------
// 에러 타입
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ClipboardCommandError {
    /// 볼트가 잠겨 있거나 자격증명을 찾을 수 없는 경우 — credentials 에러를 그대로 전파.
    #[error(transparent)]
    Credential(#[from] CredentialCommandError),

    /// 클립보드 플러그인 또는 기타 내부 오류.
    #[error("internal: {message}")]
    Internal { message: String },
}

// ---------------------------------------------------------------------------
// 카운트다운 이벤트 페이로드
// ---------------------------------------------------------------------------

/// `clipboard:countdown` 이벤트에 담기는 페이로드.
#[derive(Debug, Clone, Serialize)]
pub struct CountdownPayload {
    /// 남은 초. 0 이면 클립보드가 초기화됐음을 의미한다.
    pub remaining: u32,
}

// ---------------------------------------------------------------------------
// 내부 타이머 로직 (순수 함수 — 테스트 가능)
// ---------------------------------------------------------------------------

/// 클립보드 만료 타이머를 실행한다.
///
/// `on_tick(remaining)` — 매 초 호출, remaining = 29, 28, …, 0
/// `on_clear()` — 30초 경과 후 클립보드 초기화 시 호출
///
/// 이 함수를 순수 async 함수로 분리함으로써 Tauri 타입 없이 테스트할 수 있다.
pub async fn run_clipboard_timer<F, G>(
    total_ticks: u32,
    tick_interval: Duration,
    on_tick: F,
    on_clear: G,
) where
    F: Fn(u32) + Send + 'static,
    G: FnOnce() + Send + 'static,
{
    for remaining in (0..total_ticks).rev() {
        tokio::time::sleep(tick_interval).await;
        on_tick(remaining);
    }
    on_clear();
}

// ---------------------------------------------------------------------------
// Tauri 커맨드
// ---------------------------------------------------------------------------

/// 자격증명의 비밀값을 클립보드에 복사하고, 30초 후 자동으로 초기화한다.
///
/// `slot` 이 `None` 이면 Primary (기본값). Secondary 를 지정하면 보조 시크릿을 복사.
/// 이전 타이머가 실행 중이면 취소(`abort`)하고 새 타이머로 교체한다.
#[tauri::command]
pub async fn credential_copy_to_clipboard(
    id: CredentialId,
    slot: Option<RevealSlot>,
    app: tauri::AppHandle,
    state: State<'_, AppContext>,
) -> Result<(), ClipboardCommandError> {
    // ── 1. 볼트에서 평문 조회 ──────────────────────────────────────────────
    let plaintext = reveal_secret(id, slot.unwrap_or_default(), &state).await?;

    // ── 2. 클립보드에 쓰기 ────────────────────────────────────────────────
    app.clipboard()
        .write_text(plaintext.clone())
        .map_err(|e| ClipboardCommandError::Internal {
            message: e.to_string(),
        })?;

    // 평문은 클립보드 쓰기 직후 즉시 드롭 (메모리에 최대한 짧게 노출)
    drop(plaintext);

    // ── 3. 이전 타이머 취소 + 새 타이머 시작 ─────────────────────────────
    spawn_timer(app, &state.clipboard_controller).await;

    Ok(())
}

/// 이전 타이머를 취소하고 새 카운트다운 타이머를 생성한다.
async fn spawn_timer(app: tauri::AppHandle, controller: &Arc<Mutex<Option<JoinHandle<()>>>>) {
    let mut guard = controller.lock().await;

    // 이전 타이머가 있으면 강제 중단
    if let Some(handle) = guard.take() {
        handle.abort();
        // 취소 이벤트: remaining = 0 emit
        let _ = app.emit("clipboard:countdown", CountdownPayload { remaining: 0 });
    }

    let app_clone = app.clone();
    let total_ticks = (CLIPBOARD_EXPIRY.as_secs() as u32).max(1);

    let handle = tokio::spawn(async move {
        run_clipboard_timer(
            total_ticks,
            TICK_INTERVAL,
            move |remaining| {
                // 카운트다운 이벤트 emit — 윈도우가 닫혀 있을 수 있으므로 에러는 무시
                let _ = app_clone.emit("clipboard:countdown", CountdownPayload { remaining });
            },
            move || {
                // 30초 경과: 클립보드를 빈 문자열로 덮어쓴다
                let _ = app.clipboard().write_text("");
                let _ = app.emit("clipboard:countdown", CountdownPayload { remaining: 0 });
            },
        )
        .await;
    });

    *guard = Some(handle);
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    /// 가짜 시계로 N초를 진행하고, spawn된 태스크가 실행될 기회를 충분히 준다.
    ///
    /// `tokio::time::advance`는 sleeping future를 깨우지만, spawn된 태스크는
    /// 현재 태스크가 양보(yield)해야 실행된다. 1초씩 분할하고 여러 번 yield해서
    /// 각 tick이 완전히 처리된 후 다음 초로 넘어간다.
    async fn advance_and_yield(secs: u64) {
        for _ in 0..secs {
            tokio::time::advance(Duration::from_secs(1)).await;
            // advance 후 최소 두 번 yield: 첫 yield는 sleep을 깨우고,
            // 두 번째 yield는 on_tick 콜백까지 실행되도록 보장한다.
            tokio::task::yield_now().await;
            tokio::task::yield_now().await;
        }
    }

    #[tokio::test(start_paused = true)]
    async fn timer_fires_30_ticks_then_clear() {
        // 각 콜백 호출 횟수를 원자적으로 추적한다.
        let tick_count = Arc::new(AtomicU32::new(0));
        let clear_count = Arc::new(AtomicU32::new(0));

        let tick_count_clone = Arc::clone(&tick_count);
        let clear_count_clone = Arc::clone(&clear_count);

        // 타이머를 백그라운드로 시작한다.
        let handle = tokio::spawn(run_clipboard_timer(
            30,
            TICK_INTERVAL,
            move |_remaining| {
                tick_count_clone.fetch_add(1, Ordering::SeqCst);
            },
            move || {
                clear_count_clone.fetch_add(1, Ordering::SeqCst);
            },
        ));

        // 30초 진행 → tick 30회 + clear 1회
        // 1초씩 yield_now를 끼워 넣어 spawn된 태스크가 실행되도록 한다.
        advance_and_yield(30).await;
        handle
            .await
            .expect("타이머 태스크가 panic 없이 완료돼야 한다");

        assert_eq!(
            tick_count.load(Ordering::SeqCst),
            30,
            "tick 콜백이 정확히 30번 호출돼야 한다"
        );
        assert_eq!(
            clear_count.load(Ordering::SeqCst),
            1,
            "clear 콜백이 정확히 1번 호출돼야 한다"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn timer_partial_ticks_before_complete() {
        // 이 테스트는 `run_clipboard_timer`를 직접(spawn 없이) select!로 중단한다.
        // 핵심 목적: 중간에 취소됐을 때 clear 콜백이 호출되지 않음을 검증한다.
        let tick_count = Arc::new(AtomicU32::new(0));
        let clear_count = Arc::new(AtomicU32::new(0));

        let tick_count_clone = Arc::clone(&tick_count);
        let clear_count_clone = Arc::clone(&clear_count);

        // 9.5초 타임아웃으로 타이머를 select!로 경쟁시킨다.
        // 9.5초는 tick 9~10회 사이이므로, clear(30초)는 발생하지 않는다.
        let timeout = tokio::time::sleep(Duration::from_millis(9_500));
        tokio::select! {
            _ = run_clipboard_timer(
                30,
                TICK_INTERVAL,
                move |_remaining| {
                    tick_count_clone.fetch_add(1, Ordering::SeqCst);
                },
                move || {
                    clear_count_clone.fetch_add(1, Ordering::SeqCst);
                },
            ) => {
                panic!("타이머가 9.5초 내에 완료되면 안 된다 (30초 타이머)");
            }
            _ = timeout => {
                // 예상된 경로: 9.5초 후 타임아웃으로 타이머 취소
            }
        }

        // tick은 9회 (1초, 2초, …, 9초). 9.5초 타임아웃이므로 10번째 tick(10초)은 발생 전.
        assert_eq!(
            tick_count.load(Ordering::SeqCst),
            9,
            "9.5초 타임아웃 후 tick 9회 기대"
        );
        assert_eq!(
            clear_count.load(Ordering::SeqCst),
            0,
            "중간 취소 시 clear 미발생 기대"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn cancellation_aborts_previous_timer() {
        let clear_count = Arc::new(AtomicU32::new(0));
        let clear_count_clone = Arc::clone(&clear_count);

        // 첫 번째 타이머 시작
        let first_handle = tokio::spawn(run_clipboard_timer(
            30,
            TICK_INTERVAL,
            |_| {},
            move || {
                clear_count_clone.fetch_add(1, Ordering::SeqCst);
            },
        ));

        // 5초 진행 후 첫 번째 타이머 취소 (새 복사 요청 시뮬레이션)
        advance_and_yield(5).await;
        first_handle.abort();

        // 두 번째 타이머 시작 (새 복사 요청)
        let clear_count_clone2 = Arc::clone(&clear_count);
        let second_handle = tokio::spawn(run_clipboard_timer(
            30,
            TICK_INTERVAL,
            |_| {},
            move || {
                clear_count_clone2.fetch_add(1, Ordering::SeqCst);
            },
        ));

        // 두 번째 타이머를 30초 진행
        advance_and_yield(30).await;
        second_handle.await.expect("두 번째 타이머 완료");

        // clear 는 두 번째 타이머에서 1번만 발생해야 한다.
        assert_eq!(
            clear_count.load(Ordering::SeqCst),
            1,
            "첫 번째 타이머가 취소됐으므로 clear는 1회만 호출돼야 한다"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn controller_abort_replaces_handle() {
        // `Arc<Mutex<Option<JoinHandle<()>>>>` 취소 로직을 직접 검증한다.
        let controller: Arc<Mutex<Option<JoinHandle<()>>>> = Arc::new(Mutex::new(None));

        let clear_count = Arc::new(AtomicU32::new(0));

        // 첫 번째 핸들 등록
        {
            let clear_clone = Arc::clone(&clear_count);
            let mut guard = controller.lock().await;
            let h = tokio::spawn(run_clipboard_timer(
                30,
                TICK_INTERVAL,
                |_| {},
                move || {
                    clear_clone.fetch_add(1, Ordering::SeqCst);
                },
            ));
            *guard = Some(h);
        }

        // 5초 진행 후 두 번째 핸들로 교체 (첫 번째 abort)
        advance_and_yield(5).await;

        let second_handle = {
            let clear_clone = Arc::clone(&clear_count);
            let mut guard = controller.lock().await;
            // 첫 번째 핸들 abort
            if let Some(old) = guard.take() {
                old.abort();
            }
            let h = tokio::spawn(run_clipboard_timer(
                30,
                TICK_INTERVAL,
                |_| {},
                move || {
                    clear_clone.fetch_add(1, Ordering::SeqCst);
                },
            ));
            // 테스트에서는 handle을 직접 await하기 위해 반환; 실운영에서는 controller에 저장
            h
        };

        // 두 번째 타이머 완료
        advance_and_yield(30).await;
        second_handle.await.expect("두 번째 타이머 완료");

        assert_eq!(
            clear_count.load(Ordering::SeqCst),
            1,
            "첫 번째 타이머 abort 후 두 번째만 clear 호출"
        );
    }

    /// `RevealSlot` serde 역직렬화 검증:
    /// JSON `"secondary"` → `RevealSlot::Secondary`,
    /// 필드 자체가 없으면 `Default` → `RevealSlot::Primary`.
    #[test]
    fn reveal_slot_deserializes_secondary() {
        use crate::commands::credentials::RevealSlot;

        let slot: RevealSlot = serde_json::from_str("\"secondary\"").unwrap();
        assert!(
            matches!(slot, RevealSlot::Secondary),
            "\"secondary\" 는 RevealSlot::Secondary 로 역직렬화돼야 한다"
        );

        // Option<RevealSlot>이 None이면 unwrap_or_default() → Primary
        let none_slot: Option<RevealSlot> = None;
        assert!(
            matches!(none_slot.unwrap_or_default(), RevealSlot::Primary),
            "None.unwrap_or_default() 는 Primary 여야 한다"
        );
    }
}
