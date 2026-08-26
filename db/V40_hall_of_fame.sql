-- V40: 명예의 전당 (Hall of Fame)
-- seasons / season_records / season_awards 테이블 생성.
-- 매년 12월 31일 시즌이 종료되고 기록된다.

-- ── 시즌 테이블 ──────────────────────────────────────────────────────────────
create table if not exists public.seasons (
    id           serial primary key,
    team_id      text    not null references public.teams(id) on delete cascade,
    label        text    not null,        -- "창단 시즌", "2027 시즌" …
    sub_label    text,                    -- "제로의 반란", "만렙 원정대" …
    range_start  date    not null,
    range_end    date    not null,
    status       text    not null default 'active'
                         check (status in ('active', 'ended')),
    mvp_member   text,                   -- 종료 시 1위 멤버 이름 기록
    created_at   timestamptz default now()
);

-- ── 시즌 기록 테이블 (멤버별 최종 순위·EXP) ────────────────────────────────
create table if not exists public.season_records (
    id           serial primary key,
    season_id    integer not null references public.seasons(id) on delete cascade,
    team_id      text    not null,
    member       text    not null,
    rank         integer not null,
    exp          integer not null default 0,
    level        integer not null default 1,
    level_name   text    not null,
    created_at   timestamptz default now(),
    unique (season_id, member)
);

-- ── 시즌 특별상 테이블 ──────────────────────────────────────────────────────
create table if not exists public.season_awards (
    id           serial primary key,
    season_id    integer not null references public.seasons(id) on delete cascade,
    team_id      text    not null,
    icon         text    not null,       -- "🏆" "⚡" "📅"
    title        text    not null,       -- "업무 완료왕" …
    member       text    not null,
    metric       text    not null,       -- "47건" "89일" …
    created_at   timestamptz default now()
);

-- ── 창단 시즌 초기 데이터 삽입 (기존 팀 전체) ───────────────────────────────
insert into public.seasons (team_id, label, sub_label, range_start, range_end, status)
select
    t.id,
    '창단 시즌',
    '제로의 반란',
    '2026-05-01',
    '2026-08-31',
    'active'
from public.teams t
on conflict do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.seasons       enable row level security;
alter table public.season_records enable row level security;
alter table public.season_awards  enable row level security;

alter table public.seasons        force row level security;
alter table public.season_records force row level security;
alter table public.season_awards  force row level security;

-- 소속 팀 구성원은 자기 팀 데이터를 읽을 수 있다
create policy "seasons_select"
    on public.seasons for select to authenticated
    using (
        team_id in (
            select tm.team_id from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

create policy "season_records_select"
    on public.season_records for select to authenticated
    using (
        team_id in (
            select tm.team_id from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

create policy "season_awards_select"
    on public.season_awards for select to authenticated
    using (
        team_id in (
            select tm.team_id from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

-- 쓰기는 service_role 전용
grant select on public.seasons        to authenticated;
grant select on public.season_records to authenticated;
grant select on public.season_awards  to authenticated;
grant all    on public.seasons        to service_role;
grant all    on public.season_records to service_role;
grant all    on public.season_awards  to service_role;
grant usage, select on sequence public.seasons_id_seq        to service_role;
grant usage, select on sequence public.season_records_id_seq to service_role;
grant usage, select on sequence public.season_awards_id_seq  to service_role;
