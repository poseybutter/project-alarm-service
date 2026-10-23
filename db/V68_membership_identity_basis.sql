-- V68: 팀 안의 사용자 판정을 활성 멤버십 기준으로 통일 (docs/adr/팀-사용자-판정-기준.md)
--
-- 문제
--   M1. players 에 추적되지 않은 전역 유니크 players_name_key(name)·players_email_unique(email)
--       가 남아, 이미 한 팀에 속한 사람은 다른 팀 players 행을 만들 수 없다
--       (admin_add_team_membership 이 항상 23505 → "이미 해당 팀 소속입니다").
--       팀 안 중복은 V34 players_team_name_uidx(team_id, name)가 이미 막는다.
--   M2. 과거 코드가 players 행 없이 만든 활성 멤버십(legacy_player_id null)이 남아 있다.
--   M3. attendance_check·set_task_status·set_quest_done 이 본인을 그 팀 players.status='active'
--       로 판정해, 멤버십은 active 인데 players 가 정지·누락된 사용자는 출석·상태 변경이 실패한다.
--   M4. attendance_check 가 모든 예외를 일반 문구로 숨겨 원인을 알 수 없다.
--   M5. V45 demote 트리거가 기본 소속만 바뀌어도(멤버십은 active) 그 팀 players 를 정지한다.
--
-- 전제: V55·V63·V64 적용 완료. 함수 본문은 V55 와 같고 본인 판정·오류 응답만 바뀐다.
-- 롤백: 3~5 는 V55 §3·V45 §4 정의를 다시 적용. 1 은 같은 이름·이메일 행이 생기기 전까지만
--       add constraint 로 복구 가능.

-- ═══ 1. 전역 유니크 제거 → 팀별 유니크 (M1) ═════════════════════════

alter table public.players drop constraint if exists players_name_key;
alter table public.players drop constraint if exists players_email_unique;

-- 팀 안 이름 중복 방지(V34)는 유지, 팀 안 이메일 중복 방지를 새로 둔다
create unique index if not exists players_team_name_uidx
    on public.players (team_id, name);
create unique index if not exists players_team_email_uidx
    on public.players (team_id, lower(email))
    where team_id is not null;

-- ═══ 2. 고아 멤버십 보정: 활성 멤버십마다 같은 팀 players 행 연결 (M2) ═══
-- 프로필 값을 그대로 복사한다 — V63 동기화가 새 players 값으로 프로필을 덮어쓰므로
-- 다른 값을 넣으면 이름·아바타가 바뀐다. 팀 안 이름 충돌이 있으면 중단한다.

do $$
declare
    r record;
    v_player_id bigint;
begin
    for r in
        select tm.id as membership_id, tm.team_id, tm.role,
               pr.email, pr.display_name, pr.avatar_url, pr.bio, pr.job_role
        from public.team_memberships tm
        join public.profiles pr on pr.id = tm.profile_id
        left join public.players p on p.id = tm.legacy_player_id
        where tm.status = 'active'
          and pr.account_status = 'active'
          and (p.id is null or p.team_id is distinct from tm.team_id)
    loop
        if exists (
            select 1 from public.players x
            where x.team_id = r.team_id
              and x.name = r.display_name
              and lower(x.email) is distinct from lower(r.email)
        ) then
            raise exception 'V68: 팀 % 에 같은 이름(%)의 다른 사용자가 있어 보정을 중단합니다',
                r.team_id, r.display_name using errcode = '23505';
        end if;

        select x.id into v_player_id
        from public.players x
        where x.team_id = r.team_id and lower(x.email) = lower(r.email);

        if v_player_id is null then
            insert into public.players (team_id, name, email, role, status, avatar_url, bio, job_role)
            values (r.team_id, r.display_name, r.email,
                    case when r.role = 'admin' then 'admin' else 'member' end,
                    'active', r.avatar_url, r.bio, r.job_role)
            returning id into v_player_id;
        end if;

        update public.team_memberships
        set legacy_player_id = v_player_id
        where id = r.membership_id;
    end loop;
end;
$$;

-- ═══ 3. 판정 헬퍼: 현재 사용자의 그 팀 players.id (M3) ════════════════
-- 활성 멤버십 + 활성 프로필 → legacy_player_id. app_member_team_ids()(V64)와 같은 기준.
-- 멤버십이 없는 레거시 사용자만 players 경로로 판정한다.
-- p_team_id 가 null 이면 기본 소속 팀을 쓴다.

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
        (
            select p.id
            from public.players p
            where lower(p.email) = lower(auth.jwt() ->> 'email')
              and p.status = 'active'
              and (p_team_id is null or p.team_id = p_team_id)
              and not exists (
                  select 1
                  from public.profiles profile
                  join public.team_memberships membership on membership.profile_id = profile.id
                  where lower(profile.email) = lower(auth.jwt() ->> 'email')
              )
            order by p.team_id
            limit 1
        )
    )
$$;

-- 점수 RPC(소유자 권한) 내부 전용
revoke all on function public.app_my_player_id(text) from public, anon, authenticated;

-- ═══ 4. 점수 RPC 본인 판정 교체 (M3·M4) — 본문은 V55 와 동일 ═══════════

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
    -- V68: 활성 멤버십 기준 본인 판정 (players.status 는 보지 않음)
    select name into v_me from public.players
        where id = public.app_my_player_id(v_task.team_id);
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
    v_amount  := case when v_urgent then 100 else 50 end;

    if v_sign = 1 then
        -- 완료 진입: 현재 시점 기준 정시 여부를 계산하고 tasks 에 보존
        v_on_time := v_task.end_date is not null
                     and v_task.end_date >= (now() at time zone 'Asia/Seoul')::date;
        update public.tasks set was_on_time = v_on_time where id = p_task_id;
    else
        -- 완료 해제: 완료 시점에 저장한 값으로 되돌려야 카운터가 정확하다.
        -- V55 이전에 완료된 업무는 was_on_time 이 NULL 이므로 현재 시점으로 재계산한다.
        if v_task.was_on_time is not null then
            v_on_time := v_task.was_on_time;
        else
            v_on_time := v_task.end_date is not null
                         and v_task.end_date >= (now() at time zone 'Asia/Seoul')::date;
        end if;
        update public.tasks set was_on_time = null where id = p_task_id;
    end if;

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

    -- V68: 활성 멤버십 기준 본인 판정 (players.status 는 보지 않음)
    select name into v_me from public.players
        where id = public.app_my_player_id(v_quest.team_id);
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

    -- V68: 활성 멤버십 기준 본인 판정. 팀 미지정이면 기본 소속 팀
    select * into v_player
    from public.players
    where id = public.app_my_player_id(p_team_id);

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

exception
    when undefined_function or insufficient_privilege then
        raise;  -- 구조적 오류는 숨기지 않고 호출자에게 전파한다.
    when others then
        raise log 'attendance_check failed: % (%)', sqlerrm, sqlstate;
        -- V68: 원인 추적용 sqlstate 를 함께 돌려준다 (메시지 원문은 로그에만)
        return json_build_object('success', false, 'message', '출석 처리 중 오류가 발생했습니다. (' || sqlstate || ')');
end;
$$;

revoke all on function public.attendance_check(text) from public, anon;
grant execute on function public.attendance_check(text) to authenticated;

-- ═══ 5. 기본 소속 강등 시 players 정지는 멤버십도 끝났을 때만 (M5) ═══
-- 삭제(멤버십 종료)는 기존대로 정지하고, 강등(is_default true→false)은 멤버십이
-- active 로 남아 있으면 건드리지 않는다. 트리거 정의(V45 §4)는 그대로 둔다.

create or replace function public.clear_default_membership_from_legacy_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prev_bypass text;
begin
    if tg_op = 'UPDATE' and new.status = 'active' then
        return new;
    end if;

    if old.legacy_player_id is not null then
        v_prev_bypass := coalesce(current_setting('app.player_sync_bypass', true), 'off');
        perform set_config('app.player_sync_bypass', 'on', true);

        update public.players
        set status = 'suspended'
        where id = old.legacy_player_id
          and status <> 'suspended';

        perform set_config('app.player_sync_bypass', v_prev_bypass, true);
    end if;
    return old;
end;
$$;

revoke all on function public.clear_default_membership_from_legacy_player() from public;

-- ═══ 확인 쿼리 (적용 후 실행) ══════════════════════════════════════
-- 1) 전역 유니크가 없어야 함:
--    select conname from pg_constraint
--    where conrelid = 'public.players'::regclass and conname in ('players_name_key', 'players_email_unique');
-- 2) 고아 멤버십 0행:
--    select tm.id from team_memberships tm join profiles pr on pr.id = tm.profile_id
--    left join players p on p.id = tm.legacy_player_id
--    where tm.status = 'active' and pr.account_status = 'active'
--      and (p.id is null or p.team_id is distinct from tm.team_id);
