-- V55: 보안 감사(2026-09-04) 반영 — 점수 RPC 계층 명문화·강화
--
-- 발견 사항:
--  C1. players 점수 컬럼(exp/level/…)이 본인 행 직접 UPDATE 로 조작 가능
--  C2. 미추적 RPC(set_task_status/set_quest_done/_apply_exp/…)가
--      전역 is_admin 으로 크로스팀 조작 허용 + _apply_exp 가 anon 직접 호출 가능
--  H1. viewer 역할이 tasks/quests/projects/accessibility/assignments 쓰기 가능
--  H2. attendance 에 본인 스코프가 없어 타인 출석 위조 가능
--  H3. 브리핑 목요일 편집창이 클라이언트에서만 검사됨
--
-- 이 파일이 기존 미추적 함수들의 단일 출처(source of truth)가 된다.

-- ═══ 0. 내부 함수 봉인 (최우선 — anon 직접 호출 차단) ═══════════════

do $$
declare fn record;
begin
    -- 내부 헬퍼: 클라이언트가 직접 부를 이유가 없다. definer 함수 내부
    -- 호출은 소유자 권한으로 검사되므로 revoke 해도 영향 없다.
    for fn in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('_apply_exp', '_bump_activity', '_calc_level', '_level_name')
    loop
        execute format(
            'revoke execute on function %s from public, anon, authenticated',
            fn.sig
        );
    end loop;

    -- 진입점·판별 함수: anon 은 쓸 일이 없다. authenticated 는 유지
    -- (미추적 V1~V10 정책이 is_admin 등을 참조할 가능성에 대비).
    for fn in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('set_task_status', 'set_quest_done',
                            'current_member_name', 'is_admin')
    loop
        execute format('revoke execute on function %s from public, anon', fn.sig);
    end loop;
end $$;

-- ═══ 1. 점수 컬럼 가드 트리거 (C1) ══════════════════════════════════
-- 점수·출석 컬럼은 RPC(내부에서 bypass 플래그 설정)와 서버 경로
-- (service_role, 크론/SQL 에디터 등 JWT 없는 컨텍스트)만 바꿀 수 있다.

create or replace function public.players_guard_score_columns_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.exp           is distinct from old.exp
       or new.level         is distinct from old.level
       or new.month_exp     is distinct from old.month_exp
       or new.week_exp      is distinct from old.week_exp
       or new.attend_last   is distinct from old.attend_last
       or new.attend_streak is distinct from old.attend_streak
       or new.icons         is distinct from old.icons
       or new.total_done    is distinct from old.total_done
       or new.urgent_done   is distinct from old.urgent_done
       or new.on_time_done  is distinct from old.on_time_done
    then
        -- 점수 RPC 가 트랜잭션 로컬로 켜는 우회 플래그 (V44 패턴)
        if coalesce(current_setting('app.score_write_bypass', true), '') = 'on' then
            return new;
        end if;
        -- service_role(서버 API)·JWT 없는 컨텍스트(크론·마이그레이션)는 허용
        if coalesce(auth.role(), 'none') in ('service_role', 'none') then
            return new;
        end if;
        raise exception '점수·출석 컬럼은 점수 RPC 를 통해서만 변경할 수 있습니다'
            using errcode = 'insufficient_privilege';
    end if;
    return new;
end;
$$;

drop trigger if exists players_guard_score_columns on public.players;
create trigger players_guard_score_columns
    before update on public.players
    for each row
    execute function public.players_guard_score_columns_fn();

-- ═══ 2. attendance 유니크 키에 team_id 추가 (동명이인 팀 간 충돌 방지) ══

create unique index if not exists attendance_team_member_date_uidx
    on public.attendance (team_id, member, date);

-- V52 의 동일 컬럼 비유니크 인덱스는 위 유니크 인덱스가 대체한다
drop index if exists public.attendance_team_member_date_idx;

-- ═══ 3. 점수 RPC 재정의 (C2 — 팀 스코프 권한) ═══════════════════════

-- 업무 상태 변경 + 점수 처리.
-- 변경점: 전역 is_admin → 해당 팀 admin, 이름 비교 → 해당 팀에서의 본인 확인,
--         status 화이트리스트 검증, 가드 우회 플래그.
create or replace function public.set_task_status(p_task_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_me      text;
    v_task    public.tasks%rowtype;
    v_prev    text;
    v_sign    int := 0;
    v_amount  int;
    v_urgent  boolean;
    v_on_time boolean;
    v_player  public.players%rowtype;
    v_exp     jsonb;
begin
    if p_status is null or p_status not in
        ('완료', '진행중', '대기', '시작 전', '지연/보류', '이슈 및 대기')
    then
        raise exception 'invalid status: %', p_status using errcode = 'check_violation';
    end if;

    select * into v_task from public.tasks where id = p_task_id;
    if not found then
        raise exception 'task % not found', p_task_id using errcode = 'no_data_found';
    end if;

    -- 권한: 그 팀에서의 본인 업무 또는 그 팀의 관리자
    select name into v_me from public.players
        where team_id = v_task.team_id
          and lower(email) = lower(auth.jwt() ->> 'email')
          and status = 'active'
        limit 1;
    if not (public.app_is_team_admin(v_task.team_id)
            or (v_me is not null and v_task.member = v_me)) then
        raise exception 'forbidden' using errcode = 'insufficient_privilege';
    end if;

    v_prev := v_task.status;
    if v_prev is not distinct from p_status then
        return jsonb_build_object('changed', false);
    end if;
    update public.tasks set status = p_status where id = p_task_id;

    -- 점수 영향: 완료 진입(+) / 완료 이탈(-) 만 의미 있음
    if    p_status = '완료' and v_prev   <> '완료' then v_sign := 1;
    elsif v_prev   = '완료' and p_status <> '완료' then v_sign := -1;
    else  return jsonb_build_object('changed', true, 'scored', false);
    end if;

    -- ★ 서버가 직접 도출 — 클라 입력 신뢰 안 함
    v_urgent  := v_task.priority = '긴급';
    v_on_time := v_task.end_date is not null
                 and v_task.end_date >= (now() at time zone 'Asia/Seoul')::date;
    v_amount  := case when v_urgent then 100 else 50 end;

    select * into v_player from public.players
        where team_id = v_task.team_id and name = v_task.member for update;
    if not found then
        return jsonb_build_object('changed', true, 'scored', false);
    end if;

    -- 점수 가드 우회 (이 트랜잭션 안에서만)
    perform set_config('app.score_write_bypass', 'on', true);

    update public.players set
        total_done   = greatest(0, total_done   + v_sign),
        urgent_done  = greatest(0, urgent_done  + (case when v_urgent  then v_sign else 0 end)),
        on_time_done = greatest(0, on_time_done + (case when v_on_time then v_sign else 0 end))
    where id = v_player.id;

    v_exp := public._apply_exp(v_player.id, v_sign * v_amount);
    perform public._bump_activity(v_task.member, v_task.team_id, v_sign);

    return jsonb_build_object('changed', true, 'scored', true,
                              'amount', v_amount, 'sign', v_sign) || v_exp;
end; $function$;

-- 퀘스트 완료 토글 + 점수 처리. 변경점은 set_task_status 와 동일.
create or replace function public.set_quest_done(p_quest_id bigint, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_me     text;
    v_quest  public.quests%rowtype;
    v_prev_done boolean;
    v_sign   int;
    v_player public.players%rowtype;
    v_exp    jsonb;
begin
    select * into v_quest from public.quests where id = p_quest_id;
    if not found then
        raise exception 'quest % not found', p_quest_id using errcode = 'no_data_found';
    end if;

    select name into v_me from public.players
        where team_id = v_quest.team_id
          and lower(email) = lower(auth.jwt() ->> 'email')
          and status = 'active'
        limit 1;
    if not (public.app_is_team_admin(v_quest.team_id)
            or (v_me is not null and v_quest.member = v_me)) then
        raise exception 'forbidden' using errcode = 'insufficient_privilege';
    end if;

    v_prev_done := v_quest.status = '완료';
    if v_prev_done = p_done then
        return jsonb_build_object('changed', false);
    end if;

    update public.quests set status = case when p_done then '완료' else '대기' end
        where id = p_quest_id;

    v_sign := case when p_done then 1 else -1 end;

    select * into v_player from public.players
        where team_id = v_quest.team_id and name = v_quest.member for update;
    if not found then
        return jsonb_build_object('changed', true, 'scored', false);
    end if;

    perform set_config('app.score_write_bypass', 'on', true);

    v_exp := public._apply_exp(v_player.id, v_sign * 10);   -- QUEST = 10
    perform public._bump_activity(v_quest.member, v_quest.team_id, v_sign);

    return jsonb_build_object('changed', true, 'scored', true,
                              'amount', 10, 'sign', v_sign) || v_exp;
end; $function$;

-- 출석 잔디 증가. 변경점: 충돌 키에 team_id 포함.
create or replace function public._bump_activity(p_member text, p_team text, p_delta integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
    insert into public.attendance (member, date, activity_count, team_id)
    values (p_member, v_today, greatest(0, p_delta), p_team)
    on conflict (team_id, member, date)
    do update set activity_count = greatest(0, public.attendance.activity_count + p_delta);
end; $function$;

-- 출석 체크. 변경점: 팀 지정 가능(다팀 사용자 결정성), 가드 우회 플래그,
-- 충돌 키에 team_id 포함. 무인자 호출은 기존과 동일하게 동작한다.
drop function if exists public.attendance_check();
create or replace function public.attendance_check(p_team_id text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email      text;
    v_player     record;
    v_today      date := (current_timestamp at time zone 'Asia/Seoul')::date;
    v_yesterday  date := (current_timestamp at time zone 'Asia/Seoul')::date - 1;
    v_new_streak int;
    v_new_exp    int;
    v_old_level  int;
    v_new_level  int;
    v_level_up   bool := false;
begin
    v_email := auth.jwt() ->> 'email';
    if v_email is null then
        return json_build_object('success', false, 'message', '인증 정보가 없습니다.');
    end if;

    -- 팀을 지정하면 그 팀의 본인 행, 아니면 결정적 순서로 첫 행
    select * into v_player
    from public.players
    where lower(email) = lower(v_email)
      and status = 'active'
      and (p_team_id is null or team_id = p_team_id)
    order by team_id
    limit 1;

    if not found then
        return json_build_object('success', false, 'message', '플레이어 정보를 찾을 수 없습니다.');
    end if;

    if v_player.attend_last::date = v_today then
        return json_build_object(
            'success', false,
            'message', '오늘은 이미 출석했어요.',
            'streak',  v_player.attend_streak,
            'exp',     0,
            'levelUp', false
        );
    end if;

    if v_player.attend_last::date = v_yesterday then
        v_new_streak := coalesce(v_player.attend_streak, 0) + 1;
    else
        v_new_streak := 1;
    end if;

    v_new_exp   := coalesce(v_player.exp, 0) + 20;
    v_old_level := coalesce(v_player.level, 1);
    v_new_level := private.calc_level(v_new_exp);
    v_level_up  := v_new_level > v_old_level;

    perform set_config('app.score_write_bypass', 'on', true);

    update public.players
    set
        exp           = v_new_exp,
        month_exp     = coalesce(month_exp, 0) + 20,
        week_exp      = coalesce(week_exp,  0) + 20,
        level         = v_new_level,
        attend_last   = v_today,
        attend_streak = v_new_streak
    where id = v_player.id;

    insert into public.attendance (team_id, member, date, activity_count)
    values (v_player.team_id, v_player.name, v_today, 1)
    on conflict (team_id, member, date)
    do update set activity_count = public.attendance.activity_count + 1;

    if v_level_up then
        return json_build_object(
            'success',   true,
            'streak',    v_new_streak,
            'exp',       20,
            'levelUp',   true,
            'newLevel',  v_new_level,
            'levelName', private.level_name(v_new_level)
        );
    else
        return json_build_object(
            'success', true,
            'streak',  v_new_streak,
            'exp',     20,
            'levelUp', false
        );
    end if;

exception when others then
    return json_build_object('success', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.attendance_check(text) from public, anon;
grant execute on function public.attendance_check(text) to authenticated;

-- ═══ 4. 옛 (member, date) 유니크 키 제거 (새 키가 대체) ═════════════

do $$
declare c record;
begin
    for c in
        select con.conname
        from pg_constraint con
        where con.conrelid = 'public.attendance'::regclass
          and con.contype = 'u'
          and (
              select array_agg(att.attname order by att.attname)
              from unnest(con.conkey) as k(attnum)
              join pg_attribute att
                on att.attrelid = con.conrelid and att.attnum = k.attnum
          ) = array['date', 'member']::name[]
    loop
        execute format('alter table public.attendance drop constraint %I', c.conname);
    end loop;

    for c in
        select i.indexrelid::regclass as idx
        from pg_index i
        where i.indrelid = 'public.attendance'::regclass
          and i.indisunique
          and (
              select array_agg(att.attname order by att.attname)
              from unnest(i.indkey::int2[]) as k(attnum)
              join pg_attribute att
                on att.attrelid = i.indrelid and att.attnum = k.attnum
          ) = array['date', 'member']::name[]
    loop
        execute format('drop index %s', c.idx);
    end loop;
end $$;

-- ═══ 5. viewer 쓰기 차단 (H1) — 읽기/쓰기 정책 분리 ═════════════════

do $$
declare t text;
begin
    foreach t in array array['tasks', 'quests', 'projects', 'accessibility', 'assignments']
    loop
        execute format(
            'drop policy if exists "%s accessible by active team members" on public.%I',
            t, t);
        execute format($p$
            create policy "%s readable by active team members"
            on public.%I for select to authenticated
            using (team_id in (select public.app_member_team_ids()))
        $p$, t, t);
        execute format($p$
            create policy "%s writable by team writers"
            on public.%I for insert to authenticated
            with check (team_id in (select public.app_writer_team_ids()))
        $p$, t, t);
        execute format($p$
            create policy "%s updatable by team writers"
            on public.%I for update to authenticated
            using (team_id in (select public.app_writer_team_ids()))
            with check (team_id in (select public.app_writer_team_ids()))
        $p$, t, t);
        execute format($p$
            create policy "%s deletable by team writers"
            on public.%I for delete to authenticated
            using (team_id in (select public.app_writer_team_ids()))
        $p$, t, t);
    end loop;
end $$;

-- ═══ 6. attendance 는 읽기 전용 (H2) — 쓰기는 점수 RPC 만 ═══════════
-- SECURITY DEFINER 함수는 소유자 권한으로 실행되어 RLS 영향을 받지 않는다.

drop policy if exists "attendance accessible by active team members" on public.attendance;
create policy "attendance readable by active team members"
on public.attendance
for select
to authenticated
using (team_id in (select public.app_member_team_ids()));

-- ═══ 7. 브리핑 편집창 서버 강제 (H3) ════════════════════════════════
-- 목요일 00:00~17:59 KST. 관리자는 예외(운영 대응). 클라이언트 UI 는
-- 기존대로 전원에게 창을 표시하므로 화면 동작은 그대로다.

create or replace function public.app_briefing_edit_window_open()
returns boolean
language sql
stable
as $$
    select extract(isodow from (now() at time zone 'Asia/Seoul')) = 4
       and extract(hour   from (now() at time zone 'Asia/Seoul')) < 18
$$;

revoke all on function public.app_briefing_edit_window_open() from public;
grant execute on function public.app_briefing_edit_window_open() to authenticated;

do $$
declare t text; label text;
begin
    foreach t in array array['briefings', 'briefing_tasks']
    loop
        label := replace(t, '_', ' ');
        execute format(
            'drop policy if exists "%s writable by non-viewer team members" on public.%I',
            label, t);
        execute format($p$
            create policy "%s writable by non-viewer team members"
            on public.%I for insert to authenticated
            with check (
                team_id in (select public.app_writer_team_ids())
                and (public.app_is_team_admin(team_id)
                     or public.app_briefing_edit_window_open())
            )
        $p$, label, t);
        execute format(
            'drop policy if exists "%s updatable by non-viewer team members" on public.%I',
            label, t);
        execute format($p$
            create policy "%s updatable by non-viewer team members"
            on public.%I for update to authenticated
            using (
                team_id in (select public.app_writer_team_ids())
                and (public.app_is_team_admin(team_id)
                     or public.app_briefing_edit_window_open())
            )
            with check (
                team_id in (select public.app_writer_team_ids())
                and (public.app_is_team_admin(team_id)
                     or public.app_briefing_edit_window_open())
            )
        $p$, label, t);
        execute format(
            'drop policy if exists "%s deletable by non-viewer team members" on public.%I',
            label, t);
        execute format($p$
            create policy "%s deletable by non-viewer team members"
            on public.%I for delete to authenticated
            using (
                team_id in (select public.app_writer_team_ids())
                and (public.app_is_team_admin(team_id)
                     or public.app_briefing_edit_window_open())
            )
        $p$, label, t);
    end loop;
end $$;

-- ═══ 검증 (적용 직후 SQL 에디터에서 실행) ═══════════════════════════
--
-- 1) anon 이 내부 함수를 못 부르는지:
-- select has_function_privilege('anon', p.oid, 'execute') as should_be_false, proname
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and proname in ('_apply_exp','_bump_activity');
--
-- 2) 본인 점수 직접 쓰기가 막히는지 (오류가 나면 정상):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--     '{"email":"본인이메일","role":"authenticated"}', true);
-- update public.players set exp = exp + 1
--  where lower(email) = lower('본인이메일');  -- → "점수·출석 컬럼은 ..." 예외
-- rollback;
--
-- 3) 정상 점수 경로가 사는지 (앱에서 업무 하나 완료→해제 토글, 출석 체크)
--
-- 4) viewer 차단(가짜 viewer, V53 검증과 동일 패턴):
-- begin;
-- insert into public.profiles (email, display_name, account_status)
-- values ('rls-viewer-test@example.com', 'RLS 검증용', 'active');
-- insert into public.team_memberships (profile_id, team_id, role, status)
-- select id, 'ud2', 'viewer', 'active' from public.profiles
--  where email = 'rls-viewer-test@example.com';
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--     '{"email":"rls-viewer-test@example.com","role":"authenticated"}', true);
-- insert into public.tasks (team_id, member, proj, content)
-- values ('ud2', '아무개', 'P', '테스트');  -- → RLS 위반 오류가 나면 정상
-- rollback;
