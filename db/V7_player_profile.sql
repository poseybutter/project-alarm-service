-- V7: 가입 폼 확장 — 직급(job_role) 컬럼 추가
-- - players.role 은 이미 권한용 ('admin' / 'member', V5_invitations_teams.sql) 으로 사용 중이라
--   직급/역할 자유 입력은 별도 컬럼 job_role 에 저장한다.
-- - 가입 단계에서만 입력 받고, 이후 프로필 화면에서 수정 가능.

ALTER TABLE players ADD COLUMN IF NOT EXISTS job_role TEXT;
