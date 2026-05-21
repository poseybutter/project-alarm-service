-- V6: 초대코드 검증 실패 IP 차단 카운터
-- 10분 간격 윈도우 내 같은 IP의 실패 횟수를 세서 5회 이상이면 차단.
-- 성공 시 해당 IP 의 attempts 를 삭제해 즉시 카운터 리셋.

CREATE TABLE IF NOT EXISTS invite_attempts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip           TEXT        NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_attempts_ip_time
    ON invite_attempts (ip, attempted_at DESC);

-- RLS — 카운터 자체는 클라가 임의로 IP 를 위조해도 서버에서 헤더로 결정하므로
-- 위변조 위험이 낮다. 단순 정책 하나로 다 허용.
ALTER TABLE invite_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invite_attempts open" ON invite_attempts;
CREATE POLICY "invite_attempts open"
    ON invite_attempts
    FOR ALL
    TO public
    USING (TRUE)
    WITH CHECK (TRUE);
