-- V26: ensure the configured team leader has admin permissions.
--
-- Report assignment editing and notice-tab editing are guarded by admin-level
-- permissions. The app-level leader is TEAM_MEMBER_1, so keep that player row aligned
-- with the database role used by RLS and server-side permission checks.

update public.players
set role = 'admin',
    status = 'active'
where team_id = 'ud2'
  and name = 'TEAM_MEMBER_1';
