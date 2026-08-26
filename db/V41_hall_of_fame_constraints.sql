-- V41: 명예의 전당 인덱스 및 제약 조건 추가

-- ── 인덱스 ────────────────────────────────────────────────────────────────────
create index if not exists idx_seasons_team_id
    on public.seasons(team_id);

create index if not exists idx_seasons_status
    on public.seasons(status);

create index if not exists idx_season_records_season_id
    on public.season_records(season_id);

create index if not exists idx_season_records_team_id
    on public.season_records(team_id);

create index if not exists idx_season_awards_season_id
    on public.season_awards(season_id);

-- ── season_awards 중복 방지 ───────────────────────────────────────────────────
-- ADD CONSTRAINT IF NOT EXISTS 는 PG 미지원 → UNIQUE INDEX 로 대체
-- upsert 시 onConflict: "season_id,title" 로 참조됨
create unique index if not exists uq_season_awards_season_title
    on public.season_awards(season_id, title);

-- ── team_id 외래 키 ───────────────────────────────────────────────────────────
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'season_records_team_id_fkey'
    ) then
        alter table public.season_records
            add constraint season_records_team_id_fkey
            foreign key (team_id) references public.teams(id) on delete cascade;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'season_awards_team_id_fkey'
    ) then
        alter table public.season_awards
            add constraint season_awards_team_id_fkey
            foreign key (team_id) references public.teams(id) on delete cascade;
    end if;
end $$;

-- ── 팀당 active 시즌 하나만 허용 (partial unique index) ──────────────────────
create unique index if not exists uq_seasons_one_active_per_team
    on public.seasons(team_id)
    where (status = 'active');
