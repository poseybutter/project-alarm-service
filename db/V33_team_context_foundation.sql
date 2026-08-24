-- Isolate weekly briefings by team before enabling team switching.
begin;

alter table public.briefings
    add column if not exists team_id text;

update public.briefings
set team_id = 'ud2'
where team_id is null;

alter table public.briefings
    alter column team_id set not null;

alter table public.briefings
    alter column team_id drop default;

do $$
declare
    constraint_name text;
begin
    select c.conname
    into constraint_name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'briefings'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and exists (
          select 1
          from pg_attribute a
          where a.attrelid = t.oid
            and a.attnum = c.conkey[1]
            and a.attname = 'week_start'
      )
    limit 1;

    if constraint_name is not null then
        execute format(
            'alter table public.briefings drop constraint %I',
            constraint_name
        );
    end if;
end;
$$;

create unique index if not exists briefings_team_week_start_uidx
    on public.briefings (team_id, week_start);

create index if not exists briefings_team_updated_at_idx
    on public.briefings (team_id, updated_at desc);

select
    count(*) filter (where team_id is null) as briefing_without_team,
    count(*) - count(distinct (team_id, week_start)) as duplicate_team_week
from public.briefings;

commit;
