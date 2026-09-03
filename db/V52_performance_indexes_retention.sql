-- V52: 성능 감사(2026-09) 후속 — 핫 쿼리 인덱스, V50 트리거 가드, 보존 스케줄
--
-- 1) 앱이 가장 자주 쓰는 필터(team_id+member, team_id+created_at 정렬 등)에
--    대응하는 인덱스가 없어 테이블이 자랄수록 선형으로 느려진다.
-- 2) V50 트리거가 content_items 와 무관한 UPDATE(상태 토글, 캘린더 동기화
--    북키핑)에서도 JSONB 스캔 4회를 수행한다.
-- 3) V35 의 purge_expired_agent_security_data() 가 정의만 되고 어디서도
--    호출되지 않아 보존 대상 테이블이 무한 성장한다.

-- ── 1. 핫 쿼리 인덱스 ──────────────────────────────────────────────

-- 업무 목록: .eq(team_id).order(created_at desc) — 목록·리포트 페이지의 기본 조회
create index if not exists tasks_team_created_at_idx
    on public.tasks (team_id, created_at desc);

-- team_id + member(텍스트) 필터: 홈·프로필·알림 라우트 전반에서 가장 반복되는 형태
create index if not exists tasks_team_member_idx
    on public.tasks (team_id, member);
create index if not exists quests_team_member_idx
    on public.quests (team_id, member);
create index if not exists accessibility_team_member_idx
    on public.accessibility (team_id, member);
create index if not exists attendance_team_member_date_idx
    on public.attendance (team_id, member, date);

-- 관리자 화면 팀별 카운트(head-count)와 팀 스코프 조회
create index if not exists projects_team_idx
    on public.projects (team_id);

-- players 이름 변경 전파(V34 propagate_player_reference_name)가
-- WHERE player_id = X 로 4개 테이블을 갱신한다. 기존 (team_id, player_id)
-- 복합 인덱스는 선두 컬럼이 달라 이 조건을 서비스하지 못한다.
create index if not exists tasks_player_idx
    on public.tasks (player_id) where player_id is not null;
create index if not exists quests_player_idx
    on public.quests (player_id) where player_id is not null;
create index if not exists attendance_player_idx
    on public.attendance (player_id) where player_id is not null;
create index if not exists accessibility_player_idx
    on public.accessibility (player_id) where player_id is not null;

-- 본인 읽음 상태 조회(.eq(player_id))와 realtime 필터
create index if not exists notification_reads_player_idx
    on public.notification_reads (player_id);

-- audit_logs 는 쓰기 전용으로 자라는데 created_at 인덱스가 없어
-- 보존 삭제(365일)와 사후 조회 모두 풀스캔이 된다.
create index if not exists audit_logs_created_at_idx
    on public.audit_logs (created_at);

-- ── 2. V50 트리거 가드 ─────────────────────────────────────────────
-- content_items·content·workload 가 전부 그대로인 UPDATE(상태 토글,
-- 팀 캘린더 동기화 북키핑 등)는 검증·재파생을 건너뛴다.
-- content 나 workload 만 바뀐 경우는 기존대로 content_items 를 단일
-- 출처로 재파생해야 하므로 가드에서 제외한다.
create or replace function public.tasks_sync_content_items()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'UPDATE'
       and new.content_items is not distinct from old.content_items
       and new.content is not distinct from old.content
       and new.workload is not distinct from old.workload then
        return new;
    end if;

    if new.content_items is not null then
        -- 구조 검증: 비어 있지 않은 배열이어야 한다
        if jsonb_typeof(new.content_items) != 'array'
           or jsonb_array_length(new.content_items) = 0 then
            raise exception 'content_items must be a non-empty JSON array';
        end if;

        -- 요소 검증: 각 요소는 문자열 text 를 가진 객체여야 한다
        if exists (
            select 1
            from jsonb_array_elements(new.content_items) elem
            where jsonb_typeof(elem) != 'object'
               or jsonb_typeof(elem->'text') != 'string'
        ) then
            raise exception 'each content_items element must be an object with a string "text"';
        end if;

        -- workload 검증: 있으면 0 이상의 정수여야 한다
        if exists (
            select 1
            from jsonb_array_elements(new.content_items) elem
            where elem ? 'workload'
              and jsonb_typeof(elem->'workload') != 'null'
              and (
                    jsonb_typeof(elem->'workload') != 'number'
                 or (elem->>'workload') !~ '^\d+$'
              )
        ) then
            raise exception 'content_items workload must be a non-negative integer';
        end if;

        -- content 동기화: 모든 text를 줄바꿈으로 연결
        new.content := (
            select coalesce(string_agg(elem->>'text', E'\n'), '')
            from jsonb_array_elements(new.content_items) elem
        );
        -- workload 동기화: 모든 workload 합산
        new.workload := (
            select coalesce(sum(coalesce((elem->>'workload')::int, 0)), 0)
            from jsonb_array_elements(new.content_items) elem
        );
    end if;
    return new;
end;
$$;

-- ── 3. 보존 정리 스케줄 ────────────────────────────────────────────
-- V35 purge 함수를 매일 KST 03:00 (UTC 18:00) 에 실행한다.
-- cron.schedule 은 같은 이름의 잡을 갱신하므로 재실행해도 중복되지 않는다.
do $$
begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
        create extension if not exists pg_cron;
        perform cron.schedule(
            'purge-expired-agent-security-data',
            '0 18 * * *',
            'select public.purge_expired_agent_security_data()'
        );
    else
        raise notice
            'pg_cron 을 사용할 수 없습니다. purge_expired_agent_security_data() 를 외부 스케줄러로 호출하세요.';
    end if;
end $$;
