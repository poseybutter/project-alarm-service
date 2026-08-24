-- V32 적용 후 역할·권한 연결 정합성을 확인한다.

with audit as (
    select 'membership_without_role'::text as issue, count(*)::bigint as issue_count
    from public.team_memberships
    where role_id is null

    union all

    select 'membership_with_archived_role', count(*)::bigint
    from public.team_memberships membership
    join public.roles role on role.id = membership.role_id
    where role.status <> 'active'

    union all

    select 'membership_with_foreign_team_role', count(*)::bigint
    from public.team_memberships membership
    join public.roles role on role.id = membership.role_id
    where role.team_id is not null
      and role.team_id <> membership.team_id

    union all

    select 'missing_system_role', count(*)::bigint
    from (
        values ('team_admin'), ('team_member'), ('team_viewer')
    ) expected(role_key)
    where not exists (
        select 1
        from public.roles role
        where role.team_id is null
          and role.role_key = expected.role_key
          and role.is_system
          and role.status = 'active'
    )

    union all

    select 'team_admin_missing_permission', count(*)::bigint
    from public.permissions permission
    where not exists (
        select 1
        from public.roles role
        join public.role_permissions role_permission
          on role_permission.role_id = role.id
        where role.team_id is null
          and role.role_key = 'team_admin'
          and role_permission.permission_key = permission.key
    )
)
select issue, issue_count
from audit
order by issue;
