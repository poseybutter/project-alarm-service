-- V37: block viewer role from writing briefings / briefing_tasks.
--
-- V28's RLS policy for briefings/briefing_tasks only checks active team
-- membership (app_is_team_member), not role, so an active `viewer` can
-- INSERT/UPDATE rows the API is meant to keep read-only for them.

create or replace function public.app_is_team_writer(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select case
        when exists (
            select 1
            from public.profiles profile
            join public.team_memberships membership
              on membership.profile_id = profile.id
            where lower(profile.email) = lower(auth.jwt() ->> 'email')
        ) then exists (
            select 1
            from public.team_memberships membership
            join public.profiles profile on profile.id = membership.profile_id
            where membership.team_id = p_team_id
              and lower(profile.email) = lower(auth.jwt() ->> 'email')
              and profile.account_status = 'active'
              and membership.status = 'active'
              and membership.role in ('admin', 'member')
        )
        else exists (
            select 1
            from public.players player
            where player.team_id = p_team_id
              and lower(player.email) = lower(auth.jwt() ->> 'email')
              and player.status = 'active'
              and coalesce(player.role, 'member') in ('admin', 'member')
        )
    end
$$;

revoke all on function public.app_is_team_writer(text) from public;
grant execute on function public.app_is_team_writer(text) to authenticated;

alter table if exists public.briefings enable row level security;
drop policy if exists "briefings accessible by active team members" on public.briefings;
drop policy if exists "briefings readable by active team members" on public.briefings;
drop policy if exists "briefings writable by non-viewer team members" on public.briefings;
drop policy if exists "briefings updatable by non-viewer team members" on public.briefings;
drop policy if exists "briefings deletable by non-viewer team members" on public.briefings;
create policy "briefings readable by active team members"
on public.briefings
for select
to authenticated
using (public.app_is_team_member(team_id));
create policy "briefings writable by non-viewer team members"
on public.briefings
for insert
to authenticated
with check (public.app_is_team_writer(team_id));
create policy "briefings updatable by non-viewer team members"
on public.briefings
for update
to authenticated
using (public.app_is_team_writer(team_id))
with check (public.app_is_team_writer(team_id));
create policy "briefings deletable by non-viewer team members"
on public.briefings
for delete
to authenticated
using (public.app_is_team_writer(team_id));

alter table if exists public.briefing_tasks enable row level security;
drop policy if exists "briefing tasks accessible by active team members" on public.briefing_tasks;
drop policy if exists "briefing tasks readable by active team members" on public.briefing_tasks;
drop policy if exists "briefing tasks writable by non-viewer team members" on public.briefing_tasks;
drop policy if exists "briefing tasks updatable by non-viewer team members" on public.briefing_tasks;
drop policy if exists "briefing tasks deletable by non-viewer team members" on public.briefing_tasks;
create policy "briefing tasks readable by active team members"
on public.briefing_tasks
for select
to authenticated
using (public.app_is_team_member(team_id));
create policy "briefing tasks writable by non-viewer team members"
on public.briefing_tasks
for insert
to authenticated
with check (public.app_is_team_writer(team_id));
create policy "briefing tasks updatable by non-viewer team members"
on public.briefing_tasks
for update
to authenticated
using (public.app_is_team_writer(team_id))
with check (public.app_is_team_writer(team_id));
create policy "briefing tasks deletable by non-viewer team members"
on public.briefing_tasks
for delete
to authenticated
using (public.app_is_team_writer(team_id));
