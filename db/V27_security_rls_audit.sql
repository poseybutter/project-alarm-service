-- V27: security audit helper for Supabase RLS posture.
-- This is intentionally non-destructive. Run it in the Supabase SQL editor
-- and inspect rows where risk_level is not 'ok' before adding enforcement policies.

create schema if not exists private;

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
        ('agent_accessibility_mission_snoozes')
),
server_only_tables(table_name) as (
    values
        -- Stores Google OAuth access/refresh tokens. It is intentionally
        -- accessible only through service_role server routes.
        ('agent_calendar_connections')
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
order by
    risk_level asc,
    t.table_name asc;

comment on view private.security_rls_audit is
    'Lists app tables and whether RLS/policies are configured. Review rows where risk_level is not ok.';
