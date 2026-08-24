-- V36: run only after the matching application version is deployed. Sensitive
-- agent data is then accessible exclusively through authenticated server routes.

do $$
declare
    table_name text;
    policy_name text;
begin
    foreach table_name in array array[
        'agent_suggestions',
        'agent_notification_deliveries',
        'agent_member_webhooks',
        'agent_calendar_events',
        'agent_member_notification_settings',
        'agent_team_calendar_settings',
        'agent_member_calendar_settings'
    ] loop
        if to_regclass(format('public.%I', table_name)) is null then
            continue;
        end if;

        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
        execute format('revoke all on table public.%I from anon, authenticated', table_name);
        execute format('grant all on table public.%I to service_role', table_name);

        for policy_name in
            select policyname
            from pg_policies
            where schemaname = 'public'
              and tablename = table_name
        loop
            execute format(
                'drop policy if exists %I on public.%I',
                policy_name,
                table_name
            );
        end loop;
    end loop;
end
$$;

comment on table public.agent_member_webhooks is
    'Server-only Google Chat webhook secrets. Never expose another member webhook URL.';
comment on table public.agent_suggestions is
    'Server-only agent suggestions; payload and evidence may contain personal work data.';
comment on table public.agent_notification_deliveries is
    'Server-only personalized notification delivery history.';

-- V27 originally recognized only OAuth connections as server-only. Keep the
-- audit view aligned so intentionally policy-free sensitive tables are not
-- reported as accidental gaps.
create or replace view private.security_rls_audit as
with app_tables(table_name) as (
    values
        ('players'),
        ('tasks'),
        ('quests'),
        ('projects'),
        ('accessibility'),
        ('attendance'),
        ('avatars'),
        ('notifications'),
        ('notification_reads'),
        ('briefings'),
        ('briefing_tasks'),
        ('assignments'),
        ('audit_logs'),
        ('agent_suggestions'),
        ('agent_notification_deliveries'),
        ('agent_member_webhooks'),
        ('agent_personal_reminders'),
        ('agent_calendar_connections'),
        ('agent_calendar_events'),
        ('agent_member_notification_settings'),
        ('agent_team_calendar_settings'),
        ('agent_member_calendar_settings'),
        ('agent_accessibility_mission_snoozes'),
        ('level_up_notification_events')
),
server_only_tables(table_name) as (
    values
        ('agent_suggestions'),
        ('agent_notification_deliveries'),
        ('agent_member_webhooks'),
        ('agent_calendar_connections'),
        ('agent_calendar_events'),
        ('agent_member_notification_settings'),
        ('agent_team_calendar_settings'),
        ('agent_member_calendar_settings'),
        ('level_up_notification_events')
)
select
    t.table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as force_rls_enabled,
    coalesce(policy_counts.policy_count, 0) as policy_count,
    case
        when c.relrowsecurity = false then 'rls_disabled'
        when coalesce(policy_counts.policy_count, 0) = 0
             and server_only_tables.table_name is null then 'no_client_policy'
        else 'ok'
    end as risk_level,
    server_only_tables.table_name is not null as server_only
from app_tables t
left join pg_class c
    on c.relname = t.table_name
left join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
left join (
    select schemaname, tablename, count(*) as policy_count
    from pg_policies
    where schemaname = 'public'
    group by schemaname, tablename
) policy_counts
    on policy_counts.schemaname = n.nspname
   and policy_counts.tablename = t.table_name
left join server_only_tables
    on server_only_tables.table_name = t.table_name
where c.oid is not null
order by risk_level asc, t.table_name asc;
