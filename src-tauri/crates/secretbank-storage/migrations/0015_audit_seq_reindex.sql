-- T-24-E-D5 부수 보강: 0013 에서 audit_log 테이블 DROP + RENAME 시 cascade 로
-- 사라진 idx_audit_seq 인덱스를 재생성한다. audit chain traversal (per device, seq)
-- 의 sequential scan 방지.
--
-- (CI green 라운드 — main HEAD `10e467a` 후속 fix)

CREATE INDEX IF NOT EXISTS idx_audit_seq
    ON audit_log (device_id, seq);
