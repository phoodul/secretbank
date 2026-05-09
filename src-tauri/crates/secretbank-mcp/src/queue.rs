// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// G-4-1: MCP context queue — extension 이 push 한 사이트 컨텍스트를 저장한다.
//
// # 설계
//   - capacity 10, FIFO: 11번째 push 시 oldest pop.
//   - SiteContext: host + credential_meta (id/name/issuer 만) + timestamp.
//   - 평문 secret 포함 금지 (데이터 최소화).
//   - opt-in 체크는 호출자(nm_bridge.rs)가 담당 — queue 자체는 opt-in 인지 않음.
//
// # 동시성
//   Arc<Mutex<SiteContextQueue>> 로 공유. 모든 접근은 sync (Mutex — tokio 없이).

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/// 최대 저장 컨텍스트 수 — 초과 시 oldest pop (FIFO).
pub const QUEUE_CAPACITY: usize = 10;

// ---------------------------------------------------------------------------
// 데이터 타입
// ---------------------------------------------------------------------------

/// credential 의 메타 정보 — plaintext ❌, id + name + issuer 만.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CredMeta {
    /// credential ULID
    pub id: String,
    /// credential 이름 (예: "OpenAI API Key")
    pub name: String,
    /// issuer slug (예: "openai")
    pub issuer: String,
}

/// extension 이 push 한 사이트 컨텍스트.
///
/// host: 정규화 전 URL host (예: "github.com").
/// credential_meta: 해당 host 에 매칭된 credential 메타 목록.
/// timestamp: Unix timestamp (ms) — extension 측 시각.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteContext {
    pub host: String,
    pub credential_meta: Vec<CredMeta>,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// SiteContextQueue
// ---------------------------------------------------------------------------

/// capacity 10, FIFO 사이트 컨텍스트 큐.
///
/// `push` 시 capacity 초과 → oldest(front) pop.
/// `recent(limit)` → 최신 limit 개 (LIFO 슬라이스).
#[derive(Debug, Default)]
pub struct SiteContextQueue {
    inner: VecDeque<SiteContext>,
}

impl SiteContextQueue {
    /// 새 큐를 생성한다.
    pub fn new() -> Self {
        Self {
            inner: VecDeque::with_capacity(QUEUE_CAPACITY),
        }
    }

    /// 컨텍스트를 push 한다. capacity 초과 시 oldest pop.
    pub fn push(&mut self, ctx: SiteContext) {
        if self.inner.len() >= QUEUE_CAPACITY {
            self.inner.pop_front();
        }
        self.inner.push_back(ctx);
    }

    /// 최근 `limit` 개 컨텍스트를 반환한다 (최신 순).
    ///
    /// `limit` > 저장 수이면 전체 반환.
    pub fn recent(&self, limit: usize) -> Vec<SiteContext> {
        let n = self.inner.len();
        let start = if n > limit { n - limit } else { 0 };
        self.inner.range(start..).cloned().collect::<Vec<_>>()
    }

    /// 저장된 컨텍스트 수를 반환한다.
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// 비어 있으면 true.
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

// ---------------------------------------------------------------------------
// 공유 큐 타입 + 헬퍼 함수
// ---------------------------------------------------------------------------

/// Arc<Mutex<SiteContextQueue>> 공유 큐 타입.
pub type SharedSiteContextQueue = Arc<Mutex<SiteContextQueue>>;

/// 새 공유 큐를 생성한다.
pub fn new_shared_queue() -> SharedSiteContextQueue {
    Arc::new(Mutex::new(SiteContextQueue::new()))
}

/// 공유 큐에 컨텍스트를 push 한다.
///
/// lock 실패 시 silently drop (poison guard).
pub fn push_site_context(queue: &SharedSiteContextQueue, ctx: SiteContext) {
    if let Ok(mut guard) = queue.lock() {
        guard.push(ctx);
    }
}

/// 공유 큐에서 최근 `limit` 개 컨텍스트를 반환한다.
///
/// lock 실패 시 빈 Vec 반환.
pub fn recent_contexts(queue: &SharedSiteContextQueue, limit: usize) -> Vec<SiteContext> {
    match queue.lock() {
        Ok(guard) => guard.recent(limit),
        Err(_) => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ctx(host: &str, ts: u64) -> SiteContext {
        SiteContext {
            host: host.to_string(),
            credential_meta: vec![CredMeta {
                id: format!("id_{host}"),
                name: format!("name_{host}"),
                issuer: "openai".to_string(),
            }],
            timestamp: ts,
        }
    }

    // Q1: capacity 10 — 11번째 push 시 oldest pop
    #[test]
    fn q1_capacity_10_evicts_oldest() {
        let mut q = SiteContextQueue::new();
        for i in 0..10u64 {
            q.push(make_ctx(&format!("host{i}"), i));
        }
        assert_eq!(q.len(), 10);
        // 11번째
        q.push(make_ctx("host10", 10));
        assert_eq!(q.len(), 10, "capacity 초과 시 여전히 10");
        // oldest (host0) 이 pop 되어 없어야 한다
        let all = q.recent(10);
        let hosts: Vec<&str> = all.iter().map(|c| c.host.as_str()).collect();
        assert!(
            !hosts.contains(&"host0"),
            "host0 (oldest) 가 evict 되어야 한다"
        );
        assert!(hosts.contains(&"host10"), "host10 (newest) 가 있어야 한다");
    }

    // Q2: recent(5) — 최신 5개 반환
    #[test]
    fn q2_recent_returns_newest_n() {
        let mut q = SiteContextQueue::new();
        for i in 0..8u64 {
            q.push(make_ctx(&format!("h{i}"), i));
        }
        let r = q.recent(5);
        assert_eq!(r.len(), 5);
        // 최신 5개 = h3, h4, h5, h6, h7
        let hosts: Vec<&str> = r.iter().map(|c| c.host.as_str()).collect();
        assert!(hosts.contains(&"h7"), "최신 항목 포함");
        assert!(!hosts.contains(&"h2"), "오래된 항목 제외");
    }

    // Q3: recent(limit > len) — 전체 반환
    #[test]
    fn q3_recent_limit_exceeds_len_returns_all() {
        let mut q = SiteContextQueue::new();
        q.push(make_ctx("a", 1));
        q.push(make_ctx("b", 2));
        let r = q.recent(100);
        assert_eq!(r.len(), 2);
    }

    // Q4: push_site_context / recent_contexts 헬퍼
    #[test]
    fn q4_shared_queue_helpers() {
        let sq = new_shared_queue();
        push_site_context(&sq, make_ctx("github.com", 1000));
        push_site_context(&sq, make_ctx("stripe.com", 2000));
        let r = recent_contexts(&sq, 5);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].host, "github.com");
        assert_eq!(r[1].host, "stripe.com");
    }

    // Q5: empty queue recent → empty vec
    #[test]
    fn q5_empty_queue_recent_empty() {
        let q = SiteContextQueue::new();
        assert!(q.recent(5).is_empty());
        assert!(q.is_empty());
    }

    // Q6: FIFO 순서 — push 순서대로 반환
    #[test]
    fn q6_fifo_order() {
        let mut q = SiteContextQueue::new();
        for i in 0..5u64 {
            q.push(make_ctx(&format!("site{i}"), i));
        }
        let r = q.recent(5);
        for (i, ctx) in r.iter().enumerate() {
            assert_eq!(ctx.host, format!("site{i}"), "FIFO 순서 확인");
        }
    }
}
