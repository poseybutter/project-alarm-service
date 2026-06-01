-- notifications: 배포/버전 업데이트 알림 (changelog)
-- notification_reads: 플레이어별 읽음 처리
CREATE TABLE IF NOT EXISTS notifications (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version     TEXT        NOT NULL, -- ex) v0.1.2
    title       TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    commit_sha  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_reads (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id       BIGINT      REFERENCES players(id) ON DELETE CASCADE,
    notification_id BIGINT      REFERENCES notifications(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (player_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_player ON notification_reads (player_id);

-- RLS
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- notifications: 인증된 사용자는 모두 읽기 가능
DROP POLICY IF EXISTS "notifications read all" ON notifications;
CREATE POLICY "notifications read all"
    ON notifications FOR SELECT
    TO authenticated
    USING (true);

-- notification_reads: 본인 것만 읽기/쓰기
DROP POLICY IF EXISTS "reads own" ON notification_reads;
CREATE POLICY "reads own"
    ON notification_reads FOR ALL
    TO authenticated
    USING (player_id = (SELECT id FROM players WHERE email = auth.jwt() ->> 'email'))
    WITH CHECK (player_id = (SELECT id FROM players WHERE email = auth.jwt() ->> 'email'));

-- Realtime: postgres_changes 구독을 위해 publication에 테이블 추가 (중복 시 무시)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notification_reads'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
    END IF;
END $$;
