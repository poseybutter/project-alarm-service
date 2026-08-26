-- V38: tighten server-only agent tables after V35/V36.
--
-- V36 moved sensitive agent data behind authenticated server routes, but the
-- older Google Calendar connection table was only represented in the audit
-- view. This migration applies the same forced-RLS and grant posture to every
-- server-only agent table and makes identity sequence access explicit.

do $$
declare
    table_name text;
    sequence_name text;
begin
    foreach table_name in array array[
        'agent_suggestions',
        'agent_notification_deliveries',
        'agent_member_webhooks',
        'agent_calendar_connections',
        'agent_calendar_events',
        'agent_member_notification_settings',
        'agent_team_calendar_settings',
        'agent_member_calendar_settings',
        'level_up_notification_events'
    ] loop
        if to_regclass(format('public.%I', table_name)) is null then
            continue;
        end if;

        execute format('alter table public.%I enable row level security', table_name);
        execute format('alter table public.%I force row level security', table_name);
        execute format('revoke all on table public.%I from anon, authenticated', table_name);
        execute format('grant all on table public.%I to service_role', table_name);

        sequence_name := pg_get_serial_sequence(format('public.%I', table_name), 'id');
        if sequence_name is not null then
            execute format('grant usage, select on sequence %s to service_role', sequence_name);
            execute format('revoke all on sequence %s from anon, authenticated', sequence_name);
        end if;
    end loop;
end
$$;

create or replace function public.audit_v38_server_only_agent_tables()
returns table (
    issue text,
    issue_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with server_only_tables(table_name) as (
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
    ),
    existing_tables as (
        select
            server_only_tables.table_name,
            c.relrowsecurity,
            c.relforcerowsecurity
        from server_only_tables
        join pg_class c
          on c.relname = server_only_tables.table_name
        join pg_namespace n
          on n.oid = c.relnamespace
         and n.nspname = 'public'
    ),
    table_privileges as (
        select
            table_name,
            has_table_privilege('anon', format('public.%I', table_name), 'select') as anon_select,
            has_table_privilege('authenticated', format('public.%I', table_name), 'select') as authenticated_select,
            has_table_privilege('service_role', format('public.%I', table_name), 'select') as service_select
        from existing_tables
    ),
    sequences as (
        select
            table_name,
            pg_get_serial_sequence(format('public.%I', table_name), 'id') as sequence_name
        from existing_tables
    )
    select 'server_only_table_missing_force_rls', count(*)::bigint
    from existing_tables
    where not relrowsecurity or not relforcerowsecurity

    union all

    select 'server_only_table_client_select_granted', count(*)::bigint
    from table_privileges
    where anon_select or authenticated_select

    union all

    select 'server_only_table_service_select_missing', count(*)::bigint
    from table_privileges
    where not service_select

    union all

    select 'server_only_sequence_client_usage_granted', count(*)::bigint
    from sequences
    where sequence_name is not null
      and (
        has_sequence_privilege('anon', sequence_name, 'usage')
        or has_sequence_privilege('authenticated', sequence_name, 'usage')
      )

    union all

    select 'server_only_sequence_service_usage_missing', count(*)::bigint
    from sequences
    where sequence_name is not null
      and not has_sequence_privilege('service_role', sequence_name, 'usage');
$$;

revoke all on function public.audit_v38_server_only_agent_tables() from public, anon, authenticated;
grant execute on function public.audit_v38_server_only_agent_tables() to service_role;
