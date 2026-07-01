-- V12: 점수 로직 서버화
-- EXP·레벨·출석·잔디 계산·기록을 SECURITY DEFINER RPC 로 단일화.
-- 클라이언트의 players 점수 컬럼 직접 쓰기는 별도 RLS/컬럼 권한으로 차단.

create schema if not exists private;

-- ============================================================
-- 레벨 계산 헬퍼 (내부 전용)
-- ============================================================
create or replace function private.calc_level(p_exp int)
returns int
language sql
immutable
as $$
    select case
        when p_exp >= 70000 then 8
        when p_exp >= 35000 then 7
        when p_exp >= 15000 then 6
        when p_exp >=  7000 then 5
        when p_exp >=  3000 then 4
        when p_exp >=  1500 then 3
        when p_exp >=   500 then 2
        else 1
    end;
$$;

create or replace function private.level_name(p_level int)
returns text
language sql
immutable
as $$
    select case p_level
        when 1 then '🌱 풋내기 모험가'
        when 2 then '🗡️ 수련 중인 검사'
        when 3 then '🛡️ 던전 탐험가'
        when 4 then '✨ 이름난 용병'
        when 5 then '🔥 보스 사냥꾼'
        when 6 then '💎 아케인 리버 개척자'
        when 7 then '🌟 메이플 월드의 전설'
        when 8 then '👑 검은 마법사의 숙적'
        else ''
    end;
$$;

-- ============================================================
-- attendance_check
-- 호출자: 로그인한 사용자(JWT email 로 players 식별).
-- 하루 1회만 허용. 연속 출석 streak 계산 후 EXP +20.
-- 반환 JSON:
--   success  bool
--   message  text   (실패 사유)
--   streak   int    (현재 연속 일수)
--   exp      int    (획득 EXP)
--   levelUp  bool
--   newLevel int    (레벨업 시)
--   levelName text  (레벨업 시)
-- ============================================================
create or replace function public.attendance_check()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email      text;
    v_player     record;
    v_today      date := (current_timestamp AT TIME ZONE 'Asia/Seoul')::date;
    v_yesterday  date := (current_timestamp AT TIME ZONE 'Asia/Seoul')::date - 1;
    v_new_streak int;
    v_new_exp    int;
    v_old_level  int;
    v_new_level  int;
    v_level_up   bool := false;
begin
    -- 1. JWT 에서 이메일 추출
    v_email := auth.jwt() ->> 'email';
    if v_email is null then
        return json_build_object(
            'success', false,
            'message', '인증 정보가 없습니다.'
        );
    end if;

    -- 2. players 조회
    select * into v_player
    from public.players
    where email = v_email
    limit 1;

    if not found then
        return json_build_object(
            'success', false,
            'message', '플레이어 정보를 찾을 수 없습니다.'
        );
    end if;

    -- 3. 오늘 이미 출석했는지 확인
    if v_player.attend_last::date = v_today then
        return json_build_object(
            'success', false,
            'message', '오늘은 이미 출석했어요.',
            'streak',  v_player.attend_streak,
            'exp',     0,
            'levelUp', false
        );
    end if;

    -- 4. 연속 출석 streak 계산
    if v_player.attend_last::date = v_yesterday then
        v_new_streak := coalesce(v_player.attend_streak, 0) + 1;
    else
        v_new_streak := 1;
    end if;

    -- 5. EXP 계산
    v_new_exp   := coalesce(v_player.exp, 0) + 20;
    v_old_level := coalesce(v_player.level, 1);
    v_new_level := private.calc_level(v_new_exp);
    v_level_up  := v_new_level > v_old_level;

    -- 6. players 업데이트
    update public.players
    set
        exp          = v_new_exp,
        month_exp    = coalesce(month_exp, 0) + 20,
        week_exp     = coalesce(week_exp,  0) + 20,
        level        = v_new_level,
        attend_last  = v_today,
        attend_streak = v_new_streak
    where id = v_player.id;

    -- 7. attendance 잔디 기록 (당일 행이 없으면 INSERT, 있으면 activity_count +1)
    insert into public.attendance (team_id, member, date, activity_count)
    values (v_player.team_id, v_player.name, v_today, 1)
    on conflict (member, date)
    do update set activity_count = public.attendance.activity_count + 1;

    -- 8. 결과 반환
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
    return json_build_object(
        'success', false,
        'message', sqlerrm
    );
end;
$$;

-- RPC 는 SECURITY DEFINER 이므로 anon/authenticated 모두 execute 권한 부여
grant execute on function public.attendance_check() to authenticated;
