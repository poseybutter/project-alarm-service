-- Each function performs its complete audit in one database transaction so
-- the CLI verifier never combines multiple PostgREST snapshots.
drop function if exists public.audit_v33_team_context();
create or replace function public.audit_v33_team_context()
returns table (issue text, issue_count bigint)
language sql
stable
security definer
set search_path = public
as $$
select 'briefing_without_team'::text as issue, count(*)::bigint as issue_count
from public.briefings
where team_id is null
union all
select 'duplicate_team_week', count(*)::bigint
from (
    select team_id, week_start
    from public.briefings
    group by team_id, week_start
    having count(*) > 1
) duplicates
union all
select 'active_membership_on_archived_team', count(*)::bigint
from public.team_memberships membership
join public.teams team on team.id = membership.team_id
where membership.status = 'active'
  and team.status <> 'active';
$$;

revoke all on function public.audit_v33_team_context() from public, anon, authenticated;
grant execute on function public.audit_v33_team_context() to service_role;

drop function if exists public.audit_v34_readiness();
create or replace function public.audit_v34_readiness()
returns table (issue text, issue_count bigint)
language sql
stable
security definer
set search_path = public
as $$
select 'duplicate_player_name_in_team'::text, count(*)::bigint
from (
    select team_id, name
    from public.players
    group by team_id, name
    having count(*) > 1
) duplicate_players
union all
select 'duplicate_project_name_in_team', count(*)::bigint
from (
    select team_id, name
    from public.projects
    group by team_id, name
    having count(*) > 1
) duplicate_projects;
$$;

revoke all on function public.audit_v34_readiness() from public, anon, authenticated;
grant execute on function public.audit_v34_readiness() to service_role;

select * from public.audit_v33_team_context();
