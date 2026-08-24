-- V31 적용 후 반복 실행할 수 있는 읽기 전용 정합성 점검 쿼리.
-- issue_count가 모두 0이면 레거시 players와 정규화 테이블의 핵심 관계가 일치한다.

drop function if exists public.audit_v31_identity_membership();
create or replace function public.audit_v31_identity_membership()
returns table (issue text, issue_count bigint)
language sql
stable
security definer
set search_path = public
as $$
with audit as (
    select
        'active_player_without_profile'::text as issue,
        count(*)::bigint as issue_count
    from public.players p
    where p.email is not null
      and coalesce(p.status, 'active') = 'active'
      and not exists (
          select 1
          from public.profiles profile
          where profile.email = lower(p.email)
      )

    union all

    select
        'assigned_player_without_membership',
        count(*)::bigint
    from public.players p
    join public.profiles profile
      on profile.email = lower(p.email)
    where p.team_id is not null
      and coalesce(p.status, 'active') in ('active', 'suspended')
      and not exists (
          select 1
          from public.team_memberships membership
          where membership.profile_id = profile.id
            and membership.team_id = p.team_id
      )

    union all

    select
        'profile_with_multiple_default_memberships',
        count(*)::bigint
    from (
        select profile_id
        from public.team_memberships
        where is_default
        group by profile_id
        having count(*) > 1
    ) duplicate_defaults

    union all

    select
        'pending_player_without_access_request',
        count(*)::bigint
    from public.players p
    join public.profiles profile
      on profile.email = lower(p.email)
    where p.status = 'pending'
      and not exists (
          select 1
          from public.access_requests request
          where request.profile_id = profile.id
            and request.status = 'pending'
      )

    union all

    select
        'membership_with_missing_legacy_player',
        count(*)::bigint
    from public.team_memberships membership
    where membership.legacy_player_id is not null
      and not exists (
          select 1
          from public.players p
          where p.id = membership.legacy_player_id
      )
)
select issue, issue_count
from audit
order by issue;
$$;

revoke all on function public.audit_v31_identity_membership() from public, anon, authenticated;
grant execute on function public.audit_v31_identity_membership() to service_role;

select * from public.audit_v31_identity_membership();
