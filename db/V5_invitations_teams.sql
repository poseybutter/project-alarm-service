-- V5: 초대코드 발급 + 길드 가입 플로우
-- - teams: 팀 마스터
-- - invitations: 1회용 초대코드
-- - players.bio: 가입 시 각오 한마디 (관리자만 조회)
-- - players.role: 'member' | 'admin' (이미 존재할 수 있음)

-- ── teams ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    id         TEXT PRIMARY KEY,                    -- "publishing", "frontend"
    name       TEXT        NOT NULL,
    icon       TEXT,                                -- 이모지
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 기존 다른 스키마로 만들어진 teams 테이블 호환 (CREATE TABLE IF NOT EXISTS 가
-- 컬럼 추가는 하지 않으므로 명시적으로 ALTER 한다)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS icon       TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO teams (id, name, icon) VALUES
    ('publishing', '퍼블리싱팀',  '🎨'),
    ('frontend',   '프론트엔드팀', '💻'),
    ('backend',    '백엔드팀',    '🛠️'),
    ('design',     '디자인팀',    '✏️'),
    ('qa',         'QA팀',       '🔍')
ON CONFLICT (id) DO NOTHING;

-- ── invitations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT        UNIQUE NOT NULL,         -- 8자 (정규화: 영문 대문자 + 숫자)
    team_id    TEXT        REFERENCES teams(id),
    issued_by  TEXT,                                -- email
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT FALSE,
    used_by    TEXT,                                -- email
    used_at    TIMESTAMPTZ
);
-- 기존 invitations 테이블 호환
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS team_id    TEXT REFERENCES teams(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS issued_by  TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS used       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS used_by    TEXT;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS used_at    TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_invitations_status     ON invitations (used, expires_at);
CREATE INDEX IF NOT EXISTS idx_invitations_team       ON invitations (team_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code_lower ON invitations (LOWER(code));

-- ── players.bio + 보장 컬럼 ────────────────────────────────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS bio   TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS role  TEXT NOT NULL DEFAULT 'member';
ALTER TABLE players ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_players_email ON players (email);

-- ── is_admin() helper ─────────────────────────────────────────────
-- RLS 정책 안에서 같은 테이블(players)을 EXISTS 로 재참조하면
-- "infinite recursion detected in policy for relation 'players'" 가 터진다.
-- SECURITY DEFINER 로 정의해서 함수 본문은 호출자의 RLS 를 우회하도록 한다.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM players
        WHERE email = auth.jwt() ->> 'email'
          AND role  = 'admin'
    );
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- teams: 인증된 사용자는 누구나 SELECT (팀 선택 드롭다운용)
DROP POLICY IF EXISTS "teams read" ON teams;
CREATE POLICY "teams read"
    ON teams FOR SELECT
    TO authenticated
    USING (TRUE);

-- invitations: 인증된 사용자는 SELECT 가능 (verify에서 코드 조회 필요)
-- 단, used=true 처리 / 발급은 서버 측에서 admin 체크 후 service_role로 처리하는 게 정석.
-- 여기서는 anon-key 기반 호환을 위해 정책으로 제어.
DROP POLICY IF EXISTS "invitations read" ON invitations;
CREATE POLICY "invitations read"
    ON invitations FOR SELECT
    TO authenticated
    USING (TRUE);

-- INSERT/UPDATE는 admin 플레이어만 가능
DROP POLICY IF EXISTS "invitations write admin" ON invitations;
CREATE POLICY "invitations write admin"
    ON invitations FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "invitations update admin or self-use" ON invitations;
CREATE POLICY "invitations update admin or self-use"
    ON invitations FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        OR (used = FALSE AND expires_at > NOW())  -- 가입 흐름에서 본인 사용 처리
    )
    WITH CHECK (TRUE);

-- ── players RLS (bio 보호) ────────────────────────────────────────
-- bio는 관리자만 SELECT 할 수 있어야 함.
-- 컬럼 단위 RLS는 PostgreSQL 직접 지원이 약하므로, 행 단위로 처리:
--   "자기 자신의 행" 또는 "admin이 모든 행"
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "players read own or admin" ON players;
CREATE POLICY "players read own or admin"
    ON players FOR SELECT
    TO authenticated
    USING (
        email = auth.jwt() ->> 'email'
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "players insert self pending" ON players;
CREATE POLICY "players insert self pending"
    ON players FOR INSERT
    TO authenticated
    WITH CHECK (
        email = auth.jwt() ->> 'email'
        AND status = 'pending'
    );

DROP POLICY IF EXISTS "players update admin" ON players;
CREATE POLICY "players update admin"
    ON players FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (TRUE);
