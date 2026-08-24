-- V28: Enable RLS on legacy public tables and restrict access to authenticated team members.
--
-- Run this in the Supabase SQL editor after reviewing the affected tables.
-- It keeps the app's current client-side Supabase flows working while removing
-- anonymous public access reported by Supabase Security Advisor.

create or replace function public.app_current_email()
returns text
language sql
stable
as $$
    select auth.jwt() ->> 'email'
$$;

create or replace function public.app_is_team_member(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.players p
        where p.team_id = p_team_id
          and p.email = auth.jwt() ->> 'email'
          and p.status = 'active'
    )
$$;

create or replace function public.app_is_team_admin(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.players p
        where p.team_id = p_team_id
          and p.email = auth.jwt() ->> 'email'
          and p.status = 'active'
          and p.role = 'admin'
    )
$$;

create or replace function public.app_owns_player_id(p_player_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.players p
        where p.id = p_player_id
          and p.email = auth.jwt() ->> 'email'
          and p.status = 'active'
    )
$$;

revoke all on function public.app_current_email() from public;
revoke all on function public.app_is_team_member(text) from public;
revoke all on function public.app_is_team_admin(text) from public;
revoke all on function public.app_owns_player_id(bigint) from public;
grant execute on function public.app_current_email() to authenticated;
grant execute on function public.app_is_team_member(text) to authenticated;
grant execute on function public.app_is_team_admin(text) to authenticated;
grant execute on function public.app_owns_player_id(bigint) to authenticated;

-- players contains email, role, status, avatar and score metadata.
alter table if exists public.players enable row level security;

drop policy if exists "players readable by self or active team members"
on public.players;
create policy "players readable by self or active team members"
on public.players
for select
to authenticated
using (
    email = public.app_current_email()
    or public.app_is_team_member(team_id)
);

drop policy if exists "players insertable by self as pending"
on public.players;
create policy "players insertable by self as pending"
on public.players
for insert
to authenticated
with check (
    email = public.app_current_email()
    and coalesce(status, 'pending') = 'pending'
    and coalesce(role, 'member') = 'member'
    and team_id is null
);

-- 사용자는 프로필성 필드만 변경할 수 있다. 권한·상태·소속·이메일 변경은
-- service_role 또는 팀 관리자 서버 경로에서만 수행한다.
create or replace function public.guard_player_self_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.role() = 'service_role' then
        return new;
    end if;

    if lower(new.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and (
           new.status is distinct from old.status
           or new.role is distinct from old.role
           or new.team_id is distinct from old.team_id
           or new.email is distinct from old.email
       ) then
        raise exception 'Privileged player columns cannot be changed by the owner'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.guard_player_self_privileged_columns() from public;
drop trigger if exists players_guard_self_privileged_columns on public.players;
create trigger players_guard_self_privileged_columns
before update on public.players
for each row execute function public.guard_player_self_privileged_columns();

drop policy if exists "players updatable by self or admins"
on public.players;
create policy "players updatable by self or admins"
on public.players
for update
to authenticated
using (
    email = public.app_current_email()
    or public.app_is_team_admin(team_id)
)
with check (
    email = public.app_current_email()
    or public.app_is_team_admin(team_id)
);

drop policy if exists "players deletable by admins"
on public.players;
create policy "players deletable by admins"
on public.players
for delete
to authenticated
using (public.app_is_team_admin(team_id));

-- Core app tables. These all use team_id in the current application code.
-- The app is team-operated, so authenticated active team members keep the
-- existing collaborative behavior, while anonymous access is blocked.
-- V28 can be applied before V33, so columns referenced by the RLS policies
-- must be present here. V33 later replaces the legacy briefing uniqueness rule.
alter table if exists public.briefings add column if not exists team_id text;
update public.briefings set team_id = 'ud2' where team_id is null;
alter table if exists public.briefings alter column team_id set not null;

alter table if exists public.briefing_tasks add column if not exists team_id text;
update public.briefing_tasks set team_id = 'ud2' where team_id is null;
alter table if exists public.briefing_tasks alter column team_id set not null;

alter table if exists public.tasks enable row level security;
drop policy if exists "tasks accessible by active team members" on public.tasks;
create policy "tasks accessible by active team members"
on public.tasks
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.quests enable row level security;
drop policy if exists "quests accessible by active team members" on public.quests;
create policy "quests accessible by active team members"
on public.quests
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.projects enable row level security;
drop policy if exists "projects accessible by active team members" on public.projects;
create policy "projects accessible by active team members"
on public.projects
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.accessibility enable row level security;
drop policy if exists "accessibility accessible by active team members" on public.accessibility;
create policy "accessibility accessible by active team members"
on public.accessibility
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.attendance enable row level security;
drop policy if exists "attendance accessible by active team members" on public.attendance;
create policy "attendance accessible by active team members"
on public.attendance
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.briefings enable row level security;
drop policy if exists "briefings accessible by active team members" on public.briefings;
create policy "briefings accessible by active team members"
on public.briefings
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.briefing_tasks enable row level security;
drop policy if exists "briefing tasks accessible by active team members" on public.briefing_tasks;
create policy "briefing tasks accessible by active team members"
on public.briefing_tasks
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

alter table if exists public.assignments enable row level security;
drop policy if exists "assignments accessible by active team members" on public.assignments;
create policy "assignments accessible by active team members"
on public.assignments
for all
to authenticated
using (public.app_is_team_member(team_id))
with check (public.app_is_team_member(team_id));

-- Version update notifications are global team announcements. Team members can
-- read them, but only admins should create or edit them from client-side flows.
alter table if exists public.notifications
    add column if not exists team_id text;
update public.notifications set team_id = 'ud2' where team_id is null;
alter table if exists public.notifications
    alter column team_id set not null;
alter table if exists public.notifications enable row level security;

drop policy if exists "notifications readable by active team members"
on public.notifications;
create policy "notifications readable by active team members"
on public.notifications
for select
to authenticated
using (public.app_is_team_member(team_id));

drop policy if exists "notifications manageable by admins"
on public.notifications;
create policy "notifications manageable by admins"
on public.notifications
for all
to authenticated
using (public.app_is_team_admin(team_id))
with check (public.app_is_team_admin(team_id));

-- Read receipts are personal. Users can only see and write their own rows.
alter table if exists public.notification_reads enable row level security;

drop policy if exists "notification reads accessible by owner"
on public.notification_reads;
create policy "notification reads accessible by owner"
on public.notification_reads
for all
to authenticated
using (public.app_owns_player_id(player_id))
with check (public.app_owns_player_id(player_id));

-- This table is not used by the current app code. Token-like data must not be
-- available through the public API, so RLS is enabled without client policies.
-- Server-side service_role access bypasses RLS if legacy maintenance ever needs it.
alter table if exists public.refresh_tokens enable row level security;

-- Audit logs should only be written by the current authenticated user and
-- read by admins. Server service_role routes bypass RLS.
alter table if exists public.audit_logs
    add column if not exists team_id text;
update public.audit_logs set team_id = 'ud2' where team_id is null;
alter table if exists public.audit_logs
    alter column team_id set not null;
alter table if exists public.audit_logs enable row level security;

drop policy if exists "audit logs insertable by current user"
on public.audit_logs;
create policy "audit logs insertable by current user"
on public.audit_logs
for insert
to authenticated
with check (email = public.app_current_email());

drop policy if exists "audit logs readable by admins"
on public.audit_logs;
create policy "audit logs readable by admins"
on public.audit_logs
for select
to authenticated
using (public.app_is_team_admin(team_id));
