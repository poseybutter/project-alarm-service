-- V16: assign the team admin role and clean legacy admin/test users.
--
-- This migration intentionally uses email-based predicates to avoid Korean
-- string encoding issues in SQL editors and terminals.

-- ---------------------------------------------------------------------------
-- 1) Preview current team users.
-- ---------------------------------------------------------------------------
select id, team_id, name, email, role, status
from public.players
where team_id = 'ud2'
order by id;

-- ---------------------------------------------------------------------------
-- 2) Preview rows that will be deleted.
-- ---------------------------------------------------------------------------
select id, team_id, name, email, role, status
from public.players
where team_id = 'ud2'
  and (
    email = 'admin@example.com'
    or lower(coalesce(email, '')) like '%test%'
  )
order by id;

-- ---------------------------------------------------------------------------
-- 3) Apply changes.
-- ---------------------------------------------------------------------------

-- Keep only member4@example.com as admin for team operations.
update public.players
set role = 'member'
where team_id = 'ud2'
  and role = 'admin'
  and email <> 'member4@example.com';

update public.players
set role = 'admin',
    status = 'active'
where team_id = 'ud2'
  and email = 'member4@example.com';

-- Remove the legacy admin/test player rows.
delete from public.players
where team_id = 'ud2'
  and (
    email = 'admin@example.com'
    or lower(coalesce(email, '')) like '%test%'
  );

-- ---------------------------------------------------------------------------
-- 4) Verify.
-- ---------------------------------------------------------------------------
select id, team_id, name, email, role, status
from public.players
where team_id = 'ud2'
order by role, name;
