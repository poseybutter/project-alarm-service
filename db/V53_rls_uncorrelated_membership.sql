-- V53: 핫 테이블 RLS 를 uncorrelated 서브쿼리로 재작성 (성능)
--
-- V28/V37 정책은 행마다 app_is_team_member(team_id)/app_is_team_writer(team_id)
-- 를 호출한다. 인자가 행 컬럼이라 Postgres 가 캐시하지 못해, N행 스캔 시
-- EXISTS 서브쿼리(+JWT 파싱)가 최대 2N회 실행된다.
-- V39/V40 이 쓰는 uncorrelated 패턴(문장당 1회 평가)으로 바꾼다.
--
-- 보안 의미는 바뀌지 않는다: 아래 set 함수들은 V45 app_is_team_member /
-- V37 app_is_team_writer 와 정확히 같은 조건(대소문자 처리 차이 포함)으로
-- "현재 사용자가 속한 팀 집합"을 돌려주고, 정책은 team_id IN (그 집합) 으로
-- 판정한다. 행별 OR-EXISTS 와 동치다.
-- 기존 app_is_team_* 함수는 다른 호출처를 위해 그대로 둔다.
-- V47 의 RESTRICTIVE 모듈 가드 정책도 그대로 AND 로 결합된다.

-- ── 1. 현재 사용자의 팀 집합 함수 ──────────────────────────────────

-- V45 app_is_team_member 와 동치:
--   players 경로는 이메일 대소문자 구분, memberships 경로는 구분 없음.
create or replace function public.app_member_team_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
    select p.team_id
    from public.players p
    where p.email = auth.jwt() ->> 'email'
      and p.status = 'active'
    union
    select tm.team_id
    from public.team_memberships tm
    join public.profiles pr on pr.id = tm.profile_id
    where tm.status = 'active'
      and pr.account_status = 'active'
      and lower(pr.email) = lower(auth.jwt() ->> 'email')
$$;

-- V37 app_is_team_writer 와 동치:
--   membership 행이 하나라도 있는 사용자는 memberships 경로만,
--   없는(레거시) 사용자는 players 경로만 인정한다. viewer 는 제외.
create or replace function public.app_writer_team_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
    select membership.team_id
    from public.team_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where lower(profile.email) = lower(auth.jwt() ->> 'email')
      and profile.account_status = 'active'
      and membership.status = 'active'
      and membership.role in ('admin', 'member')
    union
    select player.team_id
    from public.players player
    where lower(player.email) = lower(auth.jwt() ->> 'email')
      and player.status = 'active'
      and coalesce(player.role, 'member') in ('admin', 'member')
      and not exists (
          select 1
          from public.profiles profile
          join public.team_memberships membership
            on membership.profile_id = profile.id
          where lower(profile.email) = lower(auth.jwt() ->> 'email')
      )
$$;

revoke all on function public.app_member_team_ids() from public;
grant execute on function public.app_member_team_ids() to authenticated;
revoke all on function public.app_writer_team_ids() from public;
grant execute on function public.app_writer_team_ids() to authenticated;

-- ── 2. V28 계열 단일 정책 재작성 (6개 테이블) ──────────────────────

drop policy if exists "tasks accessible by active team members" on public.tasks;
create policy "tasks accessible by active team members"
on public.tasks
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

drop policy if exists "quests accessible by active team members" on public.quests;
create policy "quests accessible by active team members"
on public.quests
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

drop policy if exists "projects accessible by active team members" on public.projects;
create policy "projects accessible by active team members"
on public.projects
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

drop policy if exists "accessibility accessible by active team members" on public.accessibility;
create policy "accessibility accessible by active team members"
on public.accessibility
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

drop policy if exists "attendance accessible by active team members" on public.attendance;
create policy "attendance accessible by active team members"
on public.attendance
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

drop policy if exists "assignments accessible by active team members" on public.assignments;
create policy "assignments accessible by active team members"
on public.assignments
for all
to authenticated
using (team_id in (select public.app_member_team_ids()))
with check (team_id in (select public.app_member_team_ids()));

-- ── 3. V37 briefings / briefing_tasks 4정책 재작성 ─────────────────

drop policy if exists "briefings readable by active team members" on public.briefings;
create policy "briefings readable by active team members"
on public.briefings
for select
to authenticated
using (team_id in (select public.app_member_team_ids()));

drop policy if exists "briefings writable by non-viewer team members" on public.briefings;
create policy "briefings writable by non-viewer team members"
on public.briefings
for insert
to authenticated
with check (team_id in (select public.app_writer_team_ids()));

drop policy if exists "briefings updatable by non-viewer team members" on public.briefings;
create policy "briefings updatable by non-viewer team members"
on public.briefings
for update
to authenticated
using (team_id in (select public.app_writer_team_ids()))
with check (team_id in (select public.app_writer_team_ids()));

drop policy if exists "briefings deletable by non-viewer team members" on public.briefings;
create policy "briefings deletable by non-viewer team members"
on public.briefings
for delete
to authenticated
using (team_id in (select public.app_writer_team_ids()));

drop policy if exists "briefing tasks readable by active team members" on public.briefing_tasks;
create policy "briefing tasks readable by active team members"
on public.briefing_tasks
for select
to authenticated
using (team_id in (select public.app_member_team_ids()));

drop policy if exists "briefing tasks writable by non-viewer team members" on public.briefing_tasks;
create policy "briefing tasks writable by non-viewer team members"
on public.briefing_tasks
for insert
to authenticated
with check (team_id in (select public.app_writer_team_ids()));

drop policy if exists "briefing tasks updatable by non-viewer team members" on public.briefing_tasks;
create policy "briefing tasks updatable by non-viewer team members"
on public.briefing_tasks
for update
to authenticated
using (team_id in (select public.app_writer_team_ids()))
with check (team_id in (select public.app_writer_team_ids()));

drop policy if exists "briefing tasks deletable by non-viewer team members" on public.briefing_tasks;
create policy "briefing tasks deletable by non-viewer team members"
on public.briefing_tasks
for delete
to authenticated
using (team_id in (select public.app_writer_team_ids()));

-- ── 검증 (적용 직후 SQL 에디터에서 실행) ───────────────────────────
-- 트랜잭션 안에서 인증 사용자를 흉내 내 접근 범위가 그대로인지 확인한다.
-- <이메일>·<팀ID> 는 실제 값으로 바꾼다. 끝나면 rollback 으로 원복.
--
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<본인 이메일>"}', true);
-- select public.app_member_team_ids();                             -- 소속 팀 목록
-- select count(*) from public.tasks  where team_id = '<내 팀>';    -- 기존과 동일해야 함
-- select count(*) from public.tasks  where team_id = '<다른 팀>';  -- 0 이어야 함
-- select count(*) from public.briefings where team_id = '<내 팀>'; -- 기존과 동일해야 함
-- rollback;
--
-- viewer 계정으로도 한 번 더:
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<viewer 이메일>"}', true);
-- insert into public.briefings (team_id, week_start, project, maintenance, etc)
--     values ('<내 팀>', '2099-01-04', '', '', '');                -- 거부되어야 함
-- rollback;
