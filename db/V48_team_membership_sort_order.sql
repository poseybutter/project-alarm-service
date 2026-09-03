-- V48: sort_order 컬럼 추가
-- 관리자가 팀별 구성원 표시 순서를 직접 설정할 수 있도록 한다.

-- 1-A. team_memberships에 sort_order 추가
alter table public.team_memberships
  add column if not exists sort_order integer not null default 0;

-- 1-B. players에 sort_order 추가 (레거시 환경 지원)
alter table public.players
  add column if not exists sort_order integer not null default 0;

-- 2-A. team_memberships 백필: legacy_player_id 순서 → joined_at 순서
with ranked as (
  select id,
         row_number() over (
           partition by team_id
           order by
             case when legacy_player_id is not null then 0 else 1 end,
             legacy_player_id asc nulls last,
             joined_at asc
         ) - 1 as new_order
  from public.team_memberships
)
update public.team_memberships tm
set sort_order = ranked.new_order
from ranked
where tm.id = ranked.id;

-- 2-B. players 백필: id 순서
with ranked as (
  select id,
         row_number() over (
           partition by team_id
           order by id asc
         ) - 1 as new_order
  from public.players
)
update public.players p
set sort_order = ranked.new_order
from ranked
where p.id = ranked.id;

-- 3. 복합 인덱스
create index if not exists idx_team_memberships_sort_order
  on public.team_memberships (team_id, sort_order);
create index if not exists idx_players_sort_order
  on public.players (team_id, sort_order);
