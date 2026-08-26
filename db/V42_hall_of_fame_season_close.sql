-- V42: 명예의 전당 — 시즌 종료 원자화 및 안정적인 멤버 식별자

-- ── 안정적인 멤버 식별자 ─────────────────────────────────────────────────────
-- member: 종료 시점 표시 이름 스냅샷, 유지
-- player_id: 개명 후에도 동일 인물 조회용, null 이면 이름 폴백
alter table public.season_records
    add column if not exists player_id bigint references public.players(id) on delete set null;
alter table public.season_awards
    add column if not exists player_id bigint references public.players(id) on delete set null;

create index if not exists idx_season_records_player_id on public.season_records(player_id);
create index if not exists idx_season_awards_player_id  on public.season_awards(player_id);

-- ── 신규 팀 생성 시 창단 시즌 자동 생성 ──────────────────────────────────────
-- V40 시드 대상 밖(마이그레이션 이후 생성 팀)의 창단 시즌 보장용
create or replace function public.seed_initial_team_season()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_start date := current_date;
    v_end   date;
begin
    v_end := case
        when v_start <= make_date(extract(year from v_start)::int, 8, 31)
            then make_date(extract(year from v_start)::int, 8, 31)
        else make_date(extract(year from v_start)::int, 12, 31)
    end;

    insert into public.seasons (team_id, label, sub_label, range_start, range_end, status)
    values (new.id, '창단 시즌', null, v_start, v_end, 'active')
    on conflict do nothing;

    return new;
end;
$$;

revoke all on function public.seed_initial_team_season() from public;

drop trigger if exists teams_seed_initial_season on public.teams;
create trigger teams_seed_initial_season
after insert on public.teams
for each row execute function public.seed_initial_team_season();

-- ── 시즌 종료를 하나의 트랜잭션으로 처리하는 RPC ───────────────────────────
-- 계산: API 서버(src/app/api/seasons/close/route.ts) 담당
-- 쓰기: 이 함수가 원자적으로 처리 (FOR UPDATE 잠금 + status 재확인으로 동시 종료 방지)
create or replace function public.close_season(
    p_season_id integer,
    p_records jsonb,
    p_awards jsonb,
    p_mvp_member text,
    p_next_label text,
    p_next_sub_label text,
    p_next_range_start date,
    p_next_range_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_season public.seasons%rowtype;
begin
    select * into v_season
    from public.seasons
    where id = p_season_id
    for update;

    if not found then
        return jsonb_build_object('skipped', true, 'reason', 'season not found');
    end if;

    if v_season.status <> 'active' then
        return jsonb_build_object('skipped', true, 'reason', 'already closed');
    end if;

    if p_records is not null and jsonb_array_length(p_records) > 0 then
        insert into public.season_records (
            season_id, team_id, player_id, member, rank, exp, level, level_name
        )
        select
            p_season_id,
            v_season.team_id,
            nullif(r->>'player_id', '')::bigint,
            r->>'member',
            (r->>'rank')::integer,
            (r->>'exp')::integer,
            (r->>'level')::integer,
            r->>'level_name'
        from jsonb_array_elements(p_records) as r
        on conflict (season_id, member) do update
        set player_id  = excluded.player_id,
            rank        = excluded.rank,
            exp         = excluded.exp,
            level       = excluded.level,
            level_name  = excluded.level_name;
    end if;

    if p_awards is not null and jsonb_array_length(p_awards) > 0 then
        insert into public.season_awards (
            season_id, team_id, player_id, icon, title, member, metric
        )
        select
            p_season_id,
            v_season.team_id,
            nullif(a->>'player_id', '')::bigint,
            a->>'icon',
            a->>'title',
            a->>'member',
            a->>'metric'
        from jsonb_array_elements(p_awards) as a
        on conflict (season_id, title) do update
        set player_id = excluded.player_id,
            icon       = excluded.icon,
            member     = excluded.member,
            metric     = excluded.metric;
    end if;

    update public.seasons
    set status = 'ended', mvp_member = p_mvp_member
    where id = p_season_id;

    -- 팀당 active 시즌 중복 방지 (V41 partial unique index 활용)
    if p_next_label is not null then
        insert into public.seasons (team_id, label, sub_label, range_start, range_end, status)
        values (
            v_season.team_id, p_next_label, p_next_sub_label,
            p_next_range_start, p_next_range_end, 'active'
        )
        on conflict do nothing;
    end if;

    -- EXP·레벨 동시 초기화 (EXP 0 = calcLevel(0) = level 1)
    update public.players
    set exp = 0, month_exp = 0, week_exp = 0, level = 1
    where team_id = v_season.team_id;

    return jsonb_build_object('skipped', false, 'season_id', p_season_id);
end;
$$;

revoke all on function public.close_season(
    integer, jsonb, jsonb, text, text, text, date, date
) from public;
grant execute on function public.close_season(
    integer, jsonb, jsonb, text, text, text, date, date
) to service_role;
