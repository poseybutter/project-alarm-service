-- audit_logs: 인증 관련 감사 로그
-- action 예시: 'login_success' | 'login_failed' | 'logout'
CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email        TEXT,
    action       TEXT        NOT NULL,
    ip           TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_email      ON audit_logs (email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- RLS: 일반 사용자는 읽기/쓰기 직접 못 함 (서비스 역할 또는 정책으로 제어)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 자기 자신의 로그인 시점 기록만 INSERT 가능
DROP POLICY IF EXISTS "audit_logs insert own" ON audit_logs;
CREATE POLICY "audit_logs insert own"
    ON audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (email = auth.jwt() ->> 'email');
