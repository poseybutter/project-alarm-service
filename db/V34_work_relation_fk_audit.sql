with player_relation as (
    select 'tasks'::text as table_name, id::bigint as row_id,
        team_id, member, player_id
    from public.tasks
    union all
    select 'quests', id::bigint, team_id, member, player_id
    from public.quests
    union all
    select 'attendance', id::bigint, team_id, member, player_id
    from public.attendance
    union all
    select 'accessibility', id::bigint, team_id, member, player_id
    from public.accessibility
),
project_relation as (
    select 'tasks'::text as table_name, id::bigint as row_id,
        team_id, proj, project_id
    from public.tasks
    union all
    select 'quests', id::bigint, team_id, proj, project_id
    from public.quests
    union all
    select 'accessibility', id::bigint, team_id, proj, project_id
    from public.accessibility
),
current_exceptions as (
    select table_name, row_id, 'player'::text as relation_type
    from player_relation
    where member is not null and player_id is null

    union all

    select table_name, row_id, 'project'::text
    from project_relation
    where proj is not null and project_id is null
),
expected_foreign_keys (table_name, column_name, foreign_table_name) as (
    values
        ('tasks', 'player_id', 'players'),
        ('quests', 'player_id', 'players'),
        ('attendance', 'player_id', 'players'),
        ('accessibility', 'player_id', 'players'),
        ('tasks', 'project_id', 'projects'),
        ('quests', 'project_id', 'projects'),
        ('accessibility', 'project_id', 'projects')
),
expected_triggers (table_name, trigger_name) as (
    values
        ('tasks', 'tasks_sync_player_reference'),
        ('quests', 'quests_sync_player_reference'),
        ('attendance', 'attendance_sync_player_reference'),
        ('accessibility', 'accessibility_sync_player_reference'),
        ('tasks', 'tasks_sync_project_reference'),
        ('quests', 'quests_sync_project_reference'),
        ('accessibility', 'accessibility_sync_project_reference'),
        ('players', 'players_prevent_referenced_team_change'),
        ('projects', 'projects_prevent_referenced_team_change'),
        ('players', 'players_propagate_reference_name'),
        ('projects', 'projects_propagate_reference_name')
),
issues as (
    select
        'untracked_player_reference' as issue,
        count(*) as issue_count
    from current_exceptions current_row
    where current_row.relation_type = 'player'
      and not exists (
          select 1
          from public.relation_migration_exceptions exception_row
          where exception_row.table_name = current_row.table_name
            and exception_row.row_id = current_row.row_id
            and exception_row.relation_type = current_row.relation_type
      )

    union all

    select 'invalid_player_reference', count(*)
    from player_relation relation
    left join public.players player on player.id = relation.player_id
    where relation.player_id is not null
      and (
          player.id is null
          or player.team_id is distinct from relation.team_id
          or player.name is distinct from relation.member
      )

    union all

    select 'untracked_project_reference', count(*)
    from current_exceptions current_row
    where current_row.relation_type = 'project'
      and not exists (
          select 1
          from public.relation_migration_exceptions exception_row
          where exception_row.table_name = current_row.table_name
            and exception_row.row_id = current_row.row_id
            and exception_row.relation_type = current_row.relation_type
      )

    union all

    select 'invalid_project_reference', count(*)
    from project_relation relation
    left join public.projects project on project.id = relation.project_id
    where relation.project_id is not null
      and (
          project.id is null
          or project.team_id is distinct from relation.team_id
          or project.name is distinct from relation.proj
      )

    union all

    select 'duplicate_player_name_in_team', count(*)
    from (
        select team_id, name
        from public.players
        group by team_id, name
        having count(*) > 1
    ) duplicates

    union all

    select 'duplicate_project_name_in_team', count(*)
    from (
        select team_id, name
        from public.projects
        group by team_id, name
        having count(*) > 1
    ) duplicates

    union all

    select 'stale_migration_exception', count(*)
    from public.relation_migration_exceptions exception_row
    where not exists (
        select 1
        from current_exceptions current_row
        where current_row.table_name = exception_row.table_name
          and current_row.row_id = exception_row.row_id
          and current_row.relation_type = exception_row.relation_type
    )

    union all

    select 'missing_relation_foreign_key', count(*)
    from expected_foreign_keys expected
    where not exists (
        select 1
        from pg_constraint constraint_row
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = any (constraint_row.conkey)
        where constraint_row.conrelid =
              format('public.%I', expected.table_name)::regclass
          and constraint_row.contype = 'f'
          and constraint_row.confrelid =
              format('public.%I', expected.foreign_table_name)::regclass
          and attribute_row.attname = expected.column_name
    )

    union all

    select 'missing_relation_trigger', count(*)
    from expected_triggers expected
    where not exists (
        select 1
        from pg_trigger trigger_row
        where trigger_row.tgrelid =
              format('public.%I', expected.table_name)::regclass
          and trigger_row.tgname = expected.trigger_name
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
    )

    union all

    select 'missing_unique_team_name_index', count(*)
    from (
        values
            ('players_team_name_uidx'),
            ('projects_team_name_uidx')
    ) expected(index_name)
    where not exists (
        select 1
        from pg_class index_row
        join pg_namespace namespace_row
          on namespace_row.oid = index_row.relnamespace
        join pg_index index_definition
          on index_definition.indexrelid = index_row.oid
        where namespace_row.nspname = 'public'
          and index_row.relname = expected.index_name
          and index_definition.indisunique
          and index_definition.indisvalid
    )

    union all

    select 'exception_table_rls_disabled', count(*)
    from pg_class table_row
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'relation_migration_exceptions'
      and not table_row.relrowsecurity
)
select issue, issue_count
from issues
order by issue;
