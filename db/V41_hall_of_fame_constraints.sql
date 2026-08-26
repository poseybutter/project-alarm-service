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
-- 같은 시즌에 동일한 상(title)이 두 번 저장되지 않도록 유니크 제약 추가
-- upsert 시 onConflict: "season_id,title" 로 사용
alter table public.season_awards
    add constraint if not exists uq_season_awards_season_title
    unique (season_id, title);
