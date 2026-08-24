select 'briefing_without_team' as issue, count(*) as issue_count
from public.briefings
where team_id is null
union all
select 'duplicate_team_week', count(*)
from (
    select team_id, week_start
    from public.briefings
    group by team_id, week_start
    having count(*) > 1
) duplicates
union all
select 'active_membership_on_archived_team', count(*)
from public.team_memberships membership
join public.teams team on team.id = membership.team_id
where membership.status = 'active'
  and team.status <> 'active';
