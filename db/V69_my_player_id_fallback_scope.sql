-- V69: app_my_player_id 레거시 fallback 범위 제한 (PR #96 리뷰)
--
-- 문제
--   V68 app_my_player_id 의 fallback(멤버십이 없는 레거시 사용자)은 팀 미지정 호출에서
--   이메일·status 만으로 players 를 찾고 order by team_id limit 1 로 한 행을 고른다.
--   V68 부터 같은 이메일의 players 행이 여러 팀에 있을 수 있어, 행이 여럿이면 임의 팀에
--   출석·점수가 기록될 수 있다. team_id 가 null 인 행도 대상이 된다.
--
-- 변경
--   fallback 은 team_id 가 있는 행만 본다. 팀 미지정이면 활성 행이 정확히 1개일 때만 쓴다.
--   멤버십 경로와 팀 지정 fallback 은 V68 과 같다.
--
-- 전제: V68 적용 완료. 롤백: V68 §3 정의를 다시 적용.

create or replace function public.app_my_player_id(p_team_id text default null)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    with me as (
        select pr.id as profile_id
        from public.profiles pr
        where lower(pr.email) = lower(auth.jwt() ->> 'email')
          and pr.account_status = 'active'
    ),
    legacy as (
        select p.id
        from public.players p
        where lower(p.email) = lower(auth.jwt() ->> 'email')
          and p.status = 'active'
          and p.team_id is not null
          and (p_team_id is null or p.team_id = p_team_id)
          and not exists (
              select 1
              from public.profiles profile
              join public.team_memberships membership on membership.profile_id = profile.id
              where lower(profile.email) = lower(auth.jwt() ->> 'email')
          )
    )
    select coalesce(
        (
            select tm.legacy_player_id
            from public.team_memberships tm
            join me on me.profile_id = tm.profile_id
            join public.players p on p.id = tm.legacy_player_id and p.team_id = tm.team_id
            where tm.status = 'active'
              and (tm.team_id = p_team_id or (p_team_id is null and tm.is_default))
            limit 1
        ),
        -- 팀 미지정이면 유일하게 확인된 행만 쓴다 (여럿이면 null → 호출자가 "찾을 수 없음" 처리)
        (select min(id) from legacy having count(*) = 1)
    )
$$;

-- 점수 RPC(소유자 권한) 내부 전용
revoke all on function public.app_my_player_id(text) from public, anon, authenticated;

-- ═══ 확인 쿼리 (적용 후 실행) ══════════════════════════════════════
-- 1) fallback 에 걸릴 수 있는 레거시 행 (멤버십 없는 활성 players, team_id 없음 포함):
--    select p.id, p.team_id, p.email from players p
--    where p.status = 'active'
--      and not exists (select 1 from profiles pr join team_memberships tm on tm.profile_id = pr.id
--                      where lower(pr.email) = lower(p.email));