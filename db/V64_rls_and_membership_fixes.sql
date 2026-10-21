-- V64: RLS 범위·멤버십 동기화 결함 수정 + 일회성 데이터 보정
--
-- 발견 사항:
--  F1. app_member_team_ids()(V53)가 players 경로(이메일 + players.status='active')와
--      memberships 경로를 UNION 한다. 비기본 멤버십을 정지해도 players 로는
--      전파되지 않아(V43 역방향 동기화는 is_default 멤버십만) 정지된 팀에 계속
--      접근할 수 있다. players 경로 이메일 비교도 대소문자를 구분한다.
--      같은 결함이 V45 app_is_team_member / app_is_team_admin 에도 있다
--      (players SELECT/UPDATE, notifications, audit_logs 읽기, V55 RPC 가 사용).
--  F2. V61 admin_add_team_membership 이 is_default=false 를 무조건 설정한다.
--      다른 기본 멤버십이 없는 프로필이면 트리거가 방금 true 로 만든 멤버십을
--      false 로 강등 → V45 demote 트리거가 방금 만든 players 행을 정지시킨다.
--  F3. level_up_notification_events 의 unique (team_id, player_id, level)(V35)
--      때문에 close_season 이 레벨을 1로 초기화한 뒤 같은 레벨에 다시 도달해도
--      알림 이벤트가 생기지 않는다 (on conflict do nothing).
--  F4. agent_personal_reminders(V17)·agent_accessibility_mission_snoozes(V24):
--      관리자 읽기 경로가 players.status 를 보지 않아 정지된 관리자도 열람 가능,
--      UPDATE WITH CHECK 가 email 만 확인해 team_id 를 임의 팀으로 바꿀 수 있음.
--  F5. teams.settings_pin_hash(V57)가 teams SELECT 정책으로 모든 팀원에게 노출.
--      PIN → TOTP 전환(V62) 후 src 어디에서도 참조하지 않는다.
--  F6. audit_logs INSERT 정책(V28)이 email = 본인만 확인 → 임의 team_id 로
--      다른 팀 관리자에게 보이는 위조 로그를 넣을 수 있음.
--  F7. project_field_definitions.project_id(V53)·project_field_values 의
--      project_id/field_def_id 가 행의 team_id 와 같은 팀인지 검증하지 않음.
--  F8. 팀 관리자가 RLS(V28 players UPDATE)로 다른 팀원의 players.name/avatar_url
--      등을 바꾸면 V31 동기화가 전역 profiles 를 덮어쓴다.
--  F9. profiles.auth_user_id 가 비어 있는 행 → auth.uid() 기반 정책(V52/V59
--      project_field_* 등)에서 해당 사용자가 누락된다.
--  F10. F2 버그로 정지된 players 행(멤버십은 active·비기본) 일회성 복구.
--
-- 전제(추적되지 않는 V1–V10 스키마): players(id bigint, team_id text, email,
-- name, avatar_url, bio, job_role, role, status, level), projects(id bigint,
-- team_id text), teams(id text), audit_logs(email, team_id, action, ip,
-- user_agent, created_at) 컬럼이 존재한다고 가정한다.

-- ═══ 1. 팀 집합 함수: players 경로는 레거시(멤버십 없는) 사용자만 (F1) ═══
-- app_writer_team_ids()(V53)와 같은 패턴. 멤버십 행이 하나라도 있는 사용자는
-- 멤버십 상태만으로 판정되므로 비기본 멤버십 정지가 즉시 접근 차단으로 이어진다.
-- V31 정방향 동기화가 active/suspended players 행마다 멤버십을 만들므로
-- players 경로는 동기화되지 않은 예외 사용자에게만 남는다.

create or replace function public.app_member_team_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
    select tm.team_id
    from public.team_memberships tm
    join public.profiles pr on pr.id = tm.profile_id
    where tm.status = 'active'
      and pr.account_status = 'active'
      and lower(pr.email) = lower(auth.jwt() ->> 'email')
    union
    select p.team_id
    from public.players p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and p.status = 'active'
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

-- 관리자 팀 집합 (F4 정책에서 사용). 같은 레거시 규칙.
create or replace function public.app_admin_team_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
    select tm.team_id
    from public.team_memberships tm
    join public.profiles pr on pr.id = tm.profile_id
    where tm.status = 'active'
      and tm.role = 'admin'
      and pr.account_status = 'active'
      and lower(pr.email) = lower(auth.jwt() ->> 'email')
    union
    select p.team_id
    from public.players p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and p.status = 'active'
      and p.role = 'admin'
      and not exists (
          select 1
          from public.profiles profile
          join public.team_memberships membership
            on membership.profile_id = profile.id
          where lower(profile.email) = lower(auth.jwt() ->> 'email')
      )
$$;

revoke all on function public.app_admin_team_ids() from public, anon;
grant execute on function public.app_admin_team_ids() to authenticated, service_role;

-- V45 행 단위 헬퍼도 같은 규칙으로 맞춘다 (시그니처·권한 유지).
-- 아직 이 함수를 쓰는 정책: players SELECT/UPDATE/DELETE, notifications,
-- audit_logs 읽기, profiles 읽기(V31), V55 점수 RPC 의 관리자 판정.
create or replace function public.app_is_team_member(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app_member_team_ids() as t(team_id)
        where t.team_id = p_team_id
    )
$$;

create or replace function public.app_is_team_admin(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app_admin_team_ids() as t(team_id)
        where t.team_id = p_team_id
    )
$$;

revoke all on function public.app_is_team_member(text) from public;
revoke all on function public.app_is_team_admin(text) from public;
grant execute on function public.app_is_team_member(text) to authenticated;
grant execute on function public.app_is_team_admin(text) to authenticated;

-- ═══ 2. admin_add_team_membership: 유일한 기본 소속을 강등하지 않음 (F2) ═══
-- 본문은 V61 과 동일하고 is_default 처리만 바뀐다. 트리거가 만든 멤버십이
-- 프로필의 유일한 기본 소속이면 그대로 두고, 이미 다른 기본 소속이 있을 때만
-- false 로 둔다(그 경우 트리거가 이미 false 로 만들었으므로 사실상 no-op).

create or replace function public.admin_add_team_membership(
    p_team_id       text,
    p_email         text,
    p_display_name  text,
    p_role          text,       -- 'admin' | 'member' | 'viewer'
    p_avatar_url    text default null,
    p_bio           text default null,
    p_job_role      text default null,
    p_actor_email   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player_role   text;
    v_role_key      text;
    v_role_id       uuid;
    v_player_id     bigint;
    v_membership_id uuid;
    v_membership    jsonb;
begin
    -- 입력 검증
    if p_role not in ('admin', 'member', 'viewer') then
        raise exception '유효하지 않은 역할입니다: %', p_role using errcode = '22023';
    end if;

    -- players 테이블은 admin/member만 지원 — viewer는 member로 매핑
    v_player_role := case when p_role = 'admin' then 'admin' else 'member' end;

    -- 시스템 역할 ID 조회
    v_role_key := case
        when p_role = 'admin'  then 'team_admin'
        when p_role = 'viewer' then 'team_viewer'
        else 'team_member'
    end;

    select id into v_role_id
    from public.roles
    where team_id is null
      and role_key = v_role_key
      and status = 'active'
    limit 1;

    -- players row 생성 (V31 트리거가 team_memberships를 자동 생성)
    insert into public.players (team_id, name, email, role, status, avatar_url, bio, job_role)
    values (p_team_id, p_display_name, p_email, v_player_role, 'active', p_avatar_url, p_bio, p_job_role)
    returning id into v_player_id;

    -- 트리거가 생성한 membership의 role/role_id를 즉시 보정
    -- 동일 트랜잭션이므로 중간 상태가 외부에 노출되지 않음
    -- is_default: 다른 기본 소속이 있을 때만 false (V64)
    update public.team_memberships tm
    set role = p_role,
        role_id = coalesce(v_role_id, tm.role_id),
        is_default = case
            when exists (
                select 1
                from public.team_memberships other
                where other.profile_id = tm.profile_id
                  and other.is_default
                  and other.id <> tm.id
            ) then false
            else tm.is_default
        end
    where tm.legacy_player_id = v_player_id
    returning tm.id into v_membership_id;

    if v_membership_id is null then
        raise exception '트리거가 멤버십을 생성하지 못했습니다.' using errcode = 'P0002';
    end if;

    -- 결과 조회
    select jsonb_build_object(
        'id', tm.id,
        'team_id', tm.team_id,
        'role', tm.role,
        'status', tm.status,
        'is_default', tm.is_default,
        'legacy_player_id', tm.legacy_player_id
    ) into v_membership
    from public.team_memberships tm
    where tm.id = v_membership_id;

    -- 감사 로그
    if p_actor_email is not null then
        insert into public.admin_audit_logs (team_id, actor_email, action, target_type, target_id, target_label, after_state)
        values (p_team_id, p_actor_email, 'membership.added', 'team_membership', v_membership_id::text, p_display_name, v_membership);
    end if;

    return v_membership;
end;
$$;

-- V63 권한 재적용 (create or replace 는 권한을 보존하지만 명시적으로 고정)
revoke execute on function public.admin_add_team_membership(
    text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.admin_add_team_membership(
    text, text, text, text, text, text, text, text
) to service_role;

-- ═══ 3. 레벨 하락 시 레벨업 알림 이벤트 정리 (F3) ══════════════════════
-- 선택한 방식: players.level 이 내려가는 UPDATE 에서 그 선수의 "현재 레벨보다
-- 높은" 이벤트를 삭제하는 AFTER 트리거.
--  - unique 키에 season_id 를 넣으려면 players 에 현재 시즌 참조가 없어
--    캡처 트리거가 시즌을 조회해야 하고 V35 키·on conflict 절을 모두 바꿔야 한다.
--  - seasons.status → 'ended' 트리거는 close_season 만 커버하고, 수동 SQL
--    초기화 등 다른 레벨 하락 경로는 놓친다. 또 close_season 은 시즌을 먼저
--    종료하고 나서 레벨을 초기화하므로 순서상 문제는 없지만 범위가 넓다(팀 전체).
--  - 레벨 하락 트리거는 close_season(level=1) 과 모든 하락 경로를 커버하고,
--    V35 키·캡처 트리거·close_season 본문을 건드리지 않는다.
-- 하락 후 남은 미발송(pending) 이벤트도 더 이상 유효한 레벨이 아니므로 함께 삭제.

create or replace function public.clear_level_up_events_on_level_drop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.level is not null
       and old.level is not null
       and new.level < old.level then
        delete from public.level_up_notification_events
        where player_id = new.id
          and level > new.level;
    end if;
    return new;
end;
$$;

revoke all on function public.clear_level_up_events_on_level_drop()
from public, anon, authenticated;

drop trigger if exists players_clear_level_up_events_on_level_drop on public.players;
create trigger players_clear_level_up_events_on_level_drop
after update of level on public.players
for each row
execute function public.clear_level_up_events_on_level_drop();

-- 이미 지난 시즌 종료로 막혀 있는 이벤트 정리 (현재 레벨보다 높은 이벤트)
delete from public.level_up_notification_events e
using public.players p
where p.id = e.player_id
  and e.level > coalesce(p.level, 1);

-- ═══ 4. 개인 알림·접근성 스누즈 정책 (F4) ═══════════════════════════════
-- 관리자 읽기: app_admin_team_ids()(active 멤버십/active players 만).
-- INSERT/UPDATE: 행의 team_id 가 현재 소속(active) 팀이어야 한다.

drop policy if exists "personal reminders readable by owner or admins"
on public.agent_personal_reminders;
create policy "personal reminders readable by owner or admins"
on public.agent_personal_reminders
for select
to authenticated
using (
    email = auth.jwt() ->> 'email'
    or team_id in (select public.app_admin_team_ids())
);

drop policy if exists "personal reminders insertable by owner"
on public.agent_personal_reminders;
create policy "personal reminders insertable by owner"
on public.agent_personal_reminders
for insert
to authenticated
with check (
    email = auth.jwt() ->> 'email'
    and team_id in (select public.app_member_team_ids())
    and exists (
        select 1
        from public.players p
        where p.team_id = agent_personal_reminders.team_id
          and p.email = auth.jwt() ->> 'email'
          and p.name = agent_personal_reminders.member
    )
);

drop policy if exists "personal reminders updatable by owner"
on public.agent_personal_reminders;
create policy "personal reminders updatable by owner"
on public.agent_personal_reminders
for update
to authenticated
using (email = auth.jwt() ->> 'email')
with check (
    email = auth.jwt() ->> 'email'
    and team_id in (select public.app_member_team_ids())
);

drop policy if exists "accessibility mission snoozes readable by owner or admins"
on public.agent_accessibility_mission_snoozes;
create policy "accessibility mission snoozes readable by owner or admins"
on public.agent_accessibility_mission_snoozes
for select
to authenticated
using (
    email = auth.jwt() ->> 'email'
    or team_id in (select public.app_admin_team_ids())
);

drop policy if exists "accessibility mission snoozes insertable by owner"
on public.agent_accessibility_mission_snoozes;
create policy "accessibility mission snoozes insertable by owner"
on public.agent_accessibility_mission_snoozes
for insert
to authenticated
with check (
    email = auth.jwt() ->> 'email'
    and team_id in (select public.app_member_team_ids())
    and exists (
        select 1
        from public.players p
        where p.team_id = agent_accessibility_mission_snoozes.team_id
          and p.email = auth.jwt() ->> 'email'
          and p.name = agent_accessibility_mission_snoozes.member
    )
);

drop policy if exists "accessibility mission snoozes updatable by owner"
on public.agent_accessibility_mission_snoozes;
create policy "accessibility mission snoozes updatable by owner"
on public.agent_accessibility_mission_snoozes
for update
to authenticated
using (email = auth.jwt() ->> 'email')
with check (
    email = auth.jwt() ->> 'email'
    and team_id in (select public.app_member_team_ids())
);

-- (스누즈 DELETE 정책은 V24 그대로: 본인 행만 삭제)

-- ═══ 5. teams.settings_pin_hash 제거 (F5) ══════════════════════════════
-- src 에서 참조 없음(PIN → TOTP 전환). 컬럼을 삭제한다.
-- V1–V10(미추적)에서 teams 를 참조하는 뷰 등이 있어 삭제가 막히면
-- 컬럼 단위 권한으로 대체한다. 주의: 테이블 단위 SELECT 권한이 있으면 컬럼
-- revoke 가 무시되므로, 테이블 SELECT 를 회수하고 나머지 컬럼만 다시 grant 한다.
-- (대체 경로를 탄 경우 이후 teams 에 추가하는 컬럼은 별도 grant 가 필요)

do $$
declare
    v_cols text;
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'teams'
          and column_name = 'settings_pin_hash'
    ) then
        return;
    end if;

    begin
        alter table public.teams drop column settings_pin_hash;
    exception when dependent_objects_still_exist then
        raise notice 'teams.settings_pin_hash 에 의존 객체가 있어 컬럼 권한으로 대체합니다';

        select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
        into v_cols
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'teams'
          and column_name <> 'settings_pin_hash';

        execute 'revoke select on table public.teams from anon, authenticated';
        execute format('grant select (%s) on table public.teams to authenticated', v_cols);
    end;
end $$;

-- ═══ 6. audit_logs INSERT: 본인 소속 팀으로만 (F6) ══════════════════════
-- 앱(src/app/auth/callback, src/app/api/auth/logout)은 사용자 세션으로
-- team_id 없이 insert 한다. team_id 는 V28 에서 NOT NULL 이 되었고 기본값은
-- V1–V10(미추적)에 따른다. 정책만 조이면 기본값 팀에 속하지 않은 사용자의
-- 로그인 감사가 실패하므로:
--  (a) BEFORE INSERT 트리거가 사용자 요청의 team_id 를 본인 소속 팀
--      (기본 소속 우선)으로 정규화하고, 소속이 없으면 NULL 로 둔다.
--  (b) team_id NOT NULL 을 해제한다 (소속 없는 사용자의 로그인 기록).
--      NULL 행은 팀 관리자 정책에 걸리지 않으므로 service_role 만 본다.
--  (c) 정책은 team_id IS NULL OR 본인 소속 팀만 허용한다.
-- BEFORE 트리거는 RLS WITH CHECK 보다 먼저 실행된다. 앱 코드 변경은 불필요.
--
-- 운영 DB 에 따라 V28 의 audit_logs.team_id 추가가 적용되지 않은 경우가 있다
-- (42703 column "team_id" does not exist). 그 경우 team_id 기반 위조 자체가
-- 불가능하므로 이 섹션의 테이블 변경(아래 DO 블록)을 건너뛴다.

create or replace function public.normalize_audit_log_team_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_team_id text;
begin
    -- service_role·JWT 없는 컨텍스트(서버·크론·마이그레이션)는 그대로 둔다
    if coalesce(auth.role(), 'none') <> 'authenticated' then
        return new;
    end if;

    if new.team_id is not null and exists (
        select 1
        from public.app_member_team_ids() as t(team_id)
        where t.team_id = new.team_id
    ) then
        return new;
    end if;

    select tm.team_id
    into v_team_id
    from public.team_memberships tm
    join public.profiles pr on pr.id = tm.profile_id
    where lower(pr.email) = lower(auth.jwt() ->> 'email')
      and pr.account_status = 'active'
      and tm.status = 'active'
    order by tm.is_default desc, tm.joined_at
    limit 1;

    if v_team_id is null then
        select t.team_id
        into v_team_id
        from public.app_member_team_ids() as t(team_id)
        order by t.team_id
        limit 1;
    end if;

    new.team_id := v_team_id;
    return new;
end;
$$;

revoke all on function public.normalize_audit_log_team_id() from public, anon, authenticated;

do $audit$
begin
    if to_regclass('public.audit_logs') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'audit_logs'
             and column_name = 'team_id'
       ) then
        raise notice 'audit_logs.team_id 컬럼이 없어 F6 섹션을 건너뜁니다.';
        return;
    end if;

    alter table public.audit_logs alter column team_id drop not null;

    drop trigger if exists audit_logs_normalize_team_id on public.audit_logs;
    create trigger audit_logs_normalize_team_id
    before insert on public.audit_logs
    for each row
    execute function public.normalize_audit_log_team_id();

    drop policy if exists "audit logs insertable by current user"
    on public.audit_logs;
    create policy "audit logs insertable by current user"
    on public.audit_logs
    for insert
    to authenticated
    with check (
        email = public.app_current_email()
        and (
            team_id is null
            or team_id in (select public.app_member_team_ids())
        )
    );
end $audit$;

-- ═══ 7. 프로젝트 필드: project_id·field_def_id 팀 일치 검증 (F7) ═══════
-- project_field_history / project_field_audit_logs 는 V52 에서 의도적으로
-- FK 가 없고(field_def_id=0 고정 필드, 정의 삭제 후 보존) service_role 만
-- 쓰므로 대상에서 제외한다.

create or replace function public.validate_project_field_definition_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_project_team_id text;
begin
    if new.project_id is null then
        return new;
    end if;

    select p.team_id into v_project_team_id
    from public.projects p
    where p.id = new.project_id;

    if v_project_team_id is distinct from new.team_id then
        raise exception '프로젝트(%)가 필드 정의의 팀(%)에 속하지 않습니다', new.project_id, new.team_id
            using errcode = '23514';
    end if;
    return new;
end;
$$;

revoke all on function public.validate_project_field_definition_scope()
from public, anon, authenticated;

drop trigger if exists project_field_definitions_validate_scope
on public.project_field_definitions;
create trigger project_field_definitions_validate_scope
before insert or update of team_id, project_id on public.project_field_definitions
for each row
execute function public.validate_project_field_definition_scope();

create or replace function public.validate_project_field_value_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_project_team_id text;
    v_def_team_id text;
    v_def_project_id bigint;
begin
    select p.team_id into v_project_team_id
    from public.projects p
    where p.id = new.project_id;

    if v_project_team_id is distinct from new.team_id then
        raise exception '프로젝트(%)가 필드 값의 팀(%)에 속하지 않습니다', new.project_id, new.team_id
            using errcode = '23514';
    end if;

    select d.team_id, d.project_id
    into v_def_team_id, v_def_project_id
    from public.project_field_definitions d
    where d.id = new.field_def_id;

    if v_def_team_id is distinct from new.team_id
       or (v_def_project_id is not null and v_def_project_id <> new.project_id) then
        raise exception '필드 정의(%)가 프로젝트(%)·팀(%)과 일치하지 않습니다',
            new.field_def_id, new.project_id, new.team_id
            using errcode = '23514';
    end if;
    return new;
end;
$$;

revoke all on function public.validate_project_field_value_scope()
from public, anon, authenticated;

drop trigger if exists project_field_values_validate_scope
on public.project_field_values;
create trigger project_field_values_validate_scope
before insert or update of team_id, project_id, field_def_id on public.project_field_values
for each row
execute function public.validate_project_field_value_scope();

-- ═══ 8. 다른 팀원의 프로필성 필드 변경 차단 (F8) ═══════════════════════
-- V28 UPDATE 정책은 팀 관리자에게 같은 팀 players 행 UPDATE 를 허용하고,
-- V31/V63 동기화가 name/avatar_url/bio/job_role 을 전역 profiles 로 복사한다.
-- 클라이언트에서 players 프로필성 필드를 바꾸는 곳은 본인 프로필 화면뿐이고
-- (src/app/profile/ProfilePage.tsx), 관리자 편집은 service_role 서버 경로라
-- 여기서 막아도 기능 영향이 없다.

create or replace function public.guard_player_foreign_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(current_setting('app.player_sync_bypass', true), '') = 'on' then
        return new;
    end if;

    -- service_role(서버 API)·JWT 없는 컨텍스트(크론·마이그레이션)는 허용
    if coalesce(auth.role(), 'none') in ('service_role', 'none') then
        return new;
    end if;

    if lower(coalesce(old.email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')) then
        return new;
    end if;

    if new.name is distinct from old.name
       or new.avatar_url is distinct from old.avatar_url
       or new.bio is distinct from old.bio
       or new.job_role is distinct from old.job_role then
        raise exception '다른 팀원의 이름·아바타·소개는 변경할 수 없습니다'
            using errcode = 'insufficient_privilege';
    end if;
    return new;
end;
$$;

revoke all on function public.guard_player_foreign_profile_fields()
from public, anon, authenticated;

drop trigger if exists players_guard_foreign_profile_fields on public.players;
create trigger players_guard_foreign_profile_fields
before update on public.players
for each row
execute function public.guard_player_foreign_profile_fields();

-- ═══ 9. [일회성] profiles.auth_user_id 백필 (F9) ═══════════════════════
-- 대소문자만 다른 auth.users 가 여럿이면 가장 먼저 생성된 계정을 쓰고,
-- 이미 다른 프로필에 연결된 auth 계정은 건너뛴다(unique 제약).

update public.profiles pr
set auth_user_id = u.id
from (
    select distinct on (lower(au.email))
        au.id,
        lower(au.email) as email
    from auth.users au
    where au.email is not null
    order by lower(au.email), au.created_at
) u
where pr.auth_user_id is null
  and lower(pr.email) = u.email
  and not exists (
      select 1
      from public.profiles other
      where other.auth_user_id = u.id
  );

-- ═══ 10. [일회성 데이터 보정] F2 버그로 정지된 players 재활성화 (F10) ═══
-- 대상: 연결된 멤버십이 active·비기본, 프로필 active, 같은 팀인데
--       players.status = 'suspended' 인 행.
-- 정상 경로(관리자 정지)는 정방향 동기화로 멤버십도 suspended 가 되므로
-- 이 조합은 V45 demote/V61 버그 경로에서만 생긴다.
-- 주의: 기본 소속을 다른 팀으로 옮길 때 V45 가 의도적으로 정지시킨 옛 팀
--       players 행도 (멤버십이 active 라면) 함께 활성화된다. 멤버십이 active 인
--       팀이므로 정합한 상태로 본다.
-- app.player_sync_bypass(V44/V45)로 정방향 동기화·V29 가드를 우회해
-- 멤버십 역할을 덮어쓰거나 가드에 막히지 않게 한다. 이전 값을 복원한다.

do $$
declare
    v_prev_bypass text;
    v_ids bigint[];
begin
    v_prev_bypass := coalesce(current_setting('app.player_sync_bypass', true), 'off');
    perform set_config('app.player_sync_bypass', 'on', true);

    with repaired as (
        update public.players p
        set status = 'active'
        from public.team_memberships tm
        join public.profiles pr on pr.id = tm.profile_id
        where tm.legacy_player_id = p.id
          and tm.team_id = p.team_id
          and tm.status = 'active'
          and not tm.is_default
          and pr.account_status = 'active'
          and p.status = 'suspended'
        returning p.id
    )
    select array_agg(id order by id) into v_ids from repaired;

    perform set_config('app.player_sync_bypass', v_prev_bypass, true);

    raise notice 'V64 재활성화된 players: %', coalesce(v_ids::text, '{}');
end $$;

-- ═══ 참고: 마이그레이션 순서 문제 (문서화만, 파일명 변경 안 함) ═════════
-- - 파일명 정렬 시 V31_identity_membership_audit.sql 이 V31_identity_membership_foundation.sql
--   보다, V33_team_context_audit.sql 이 V33_team_context_foundation.sql 보다,
--   V34_work_relation_fk_audit.sql 이 V34_work_relation_fk_compatibility.sql 보다 먼저 온다.
--   audit 파일은 foundation 의 테이블을 참조하므로 새 환경에서는 foundation 을 먼저
--   수동 적용해야 한다. (V32_roles_permissions.sql 은 '.' < '_' 라 정상 순서)
-- - V52/V53/V54/V55 는 같은 버전 번호의 파일이 둘씩 있다 (버전 중복).
-- - V52_performance_indexes_retention.sql 은 CREATE INDEX CONCURRENTLY 를 쓰므로
--   트랜잭션 블록 안에서 실행할 수 없다 (일괄 마이그레이션 러너에서 분리 실행 필요).

-- ═══ 검증 (적용 직후 SQL 에디터에서 실행) ═══════════════════════════════
--
-- 1) 비기본 멤버십 정지 시 접근 차단 (F1):
-- begin;
-- update public.team_memberships set status = 'suspended' where id = '<비기본 멤버십 id>';
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<해당 이메일>","role":"authenticated"}', true);
-- select public.app_member_team_ids();                   -- 정지한 팀이 없어야 함
-- select public.app_is_team_member('<정지한 팀>');       -- false
-- rollback;
--
-- 2) admin_add_team_membership 이 유일한 기본 소속을 유지 (F2):
-- begin;
-- select public.admin_add_team_membership('<팀>', 'new-user@example.com', '신규', 'member');
-- select tm.is_default, p.status from public.team_memberships tm
--   join public.players p on p.id = tm.legacy_player_id
--  where p.email = 'new-user@example.com';               -- true, active
-- rollback;
--
-- 3) 레벨 하락 시 이벤트 정리 (F3):
-- begin;
-- select count(*) from public.level_up_notification_events where player_id = <id>;
-- update public.players set level = 1 where id = <id>;
-- select count(*) from public.level_up_notification_events where player_id = <id> and level > 1;  -- 0
-- rollback;
--
-- 4) team_id 변경 차단 (F4, 오류 또는 0행이면 정상):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<본인 이메일>","role":"authenticated"}', true);
-- update public.agent_personal_reminders set team_id = '<내가 속하지 않은 팀>' where id = <내 리마인더 id>;
-- rollback;
--
-- 5) PIN 해시 노출 여부 (F5):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'teams' and column_name = 'settings_pin_hash';  -- 0행
-- -- 대체 경로를 탔다면: select has_column_privilege('authenticated', 'public.teams', 'settings_pin_hash', 'select');  -- false
--
-- 6) 위조 감사 로그 차단 (F6):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<본인 이메일>","role":"authenticated"}', true);
-- insert into public.audit_logs (email, action, team_id) values ('<본인 이메일>', 'test', '<다른 팀>')
--   returning team_id;                                    -- 본인 기본 팀(또는 null)으로 바뀌어야 함
-- rollback;
--
-- 7) 팀 불일치 필드 정의/값 (F7) — 기존 위반 행 점검 (0행이어야 함):
-- select d.id, d.team_id, p.team_id as project_team
--   from public.project_field_definitions d join public.projects p on p.id = d.project_id
--  where d.team_id is distinct from p.team_id;
-- select v.id from public.project_field_values v
--   join public.projects p on p.id = v.project_id
--   join public.project_field_definitions d on d.id = v.field_def_id
--  where v.team_id is distinct from p.team_id
--     or v.team_id is distinct from d.team_id
--     or (d.project_id is not null and d.project_id <> v.project_id);
--
-- 8) 관리자가 다른 팀원 아바타 변경 시 오류 (F8):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<관리자 이메일>","role":"authenticated"}', true);
-- update public.players set avatar_url = 'x' where id = <다른 팀원 id>;  -- 오류
-- rollback;
--
-- 9) auth_user_id 미연결 프로필 (F9, 남은 행은 로그인 이력 없는 사용자):
-- select pr.email from public.profiles pr
--  where pr.auth_user_id is null
--    and exists (select 1 from auth.users u where lower(u.email) = lower(pr.email));  -- 0행
--
-- 10) 보정 후 남은 불일치 (F10, 0이어야 함):
-- select count(*) from public.players p
--   join public.team_memberships tm on tm.legacy_player_id = p.id
--   join public.profiles pr on pr.id = tm.profile_id
--  where tm.status = 'active' and not tm.is_default and pr.account_status = 'active'
--    and p.status = 'suspended' and tm.team_id = p.team_id;