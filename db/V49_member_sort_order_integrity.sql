-- V49: 구성원 순서 정합성 — 신규 행 순번 자동 할당 + 순서 변경 원자화
--
-- 배경 (PR #44 리뷰 반영):
--   1. V48이 sort_order에 default 0을 부여해, V48 적용 이후 생성되는 멤버십·
--      players 행이 항상 목록 맨 앞에 배치되고 0끼리는 표시 순서가 비결정적이었다.
--   2. reorderTeamMembers가 멤버 수만큼 개별 update를 실행한 뒤 감사 로그를
--      별도 insert로 남겨, 중간 실패 시 순서가 부분 저장될 수 있었다.
--   3. 순서 페이로드 검증이 서버에 없어 중복 ID·중복 순번·누락 구성원이
--      그대로 저장될 수 있었다.

-- ── 1. 신규 행에 팀별 마지막 순번 자동 할당 ─────────────────────────────────
-- default 0을 제거하고, sort_order를 지정하지 않은(null) 삽입에 대해서만
-- 트리거가 팀별 max+1을 채운다. NOT NULL 제약은 BEFORE 트리거 이후에
-- 검사되므로 컬럼 정의는 그대로 두고, 명시적으로 값을 넣는 경로는 유지된다.
alter table public.team_memberships alter column sort_order drop default;
alter table public.players alter column sort_order drop default;

create or replace function public.assign_team_membership_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.sort_order is not null then
        return new;
    end if;
    -- 동시 삽입에 같은 순번이 배정되지 않도록 팀 단위 트랜잭션 잠금
    perform pg_advisory_xact_lock(
        hashtext('team_memberships_sort_order:' || coalesce(new.team_id, ''))
    );
    select coalesce(max(sort_order), -1) + 1
      into new.sort_order
      from public.team_memberships
     where team_id = new.team_id;
    return new;
end;
$$;

create or replace function public.assign_player_sort_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.sort_order is not null then
        return new;
    end if;
    perform pg_advisory_xact_lock(
        hashtext('players_sort_order:' || coalesce(new.team_id, ''))
    );
    select coalesce(max(sort_order), -1) + 1
      into new.sort_order
      from public.players
     where team_id is not distinct from new.team_id;
    return new;
end;
$$;

revoke all on function public.assign_team_membership_sort_order() from public;
revoke all on function public.assign_player_sort_order() from public;

drop trigger if exists team_memberships_assign_sort_order on public.team_memberships;
create trigger team_memberships_assign_sort_order
before insert on public.team_memberships
for each row execute function public.assign_team_membership_sort_order();

drop trigger if exists players_assign_sort_order on public.players;
create trigger players_assign_sort_order
before insert on public.players
for each row execute function public.assign_player_sort_order();

-- ── 2. 순서 변경을 하나의 트랜잭션으로 처리하는 RPC ──────────────────────────
-- 검증(전체 활성 구성원 일치 + 0..n-1 순열) · sort_order 갱신 · 감사 로그를
-- 한 함수 안에서 처리한다. 중간 실패 시 전부 원복된다.
--
-- p_order 원소: { "membership_id": uuid|null, "player_id": bigint|null, "sort_order": int }
-- 검증 실패는 errcode 22023(invalid_parameter_value)으로 올려 호출부가 400으로 변환한다.
create or replace function public.admin_reorder_team_members(
    p_team_id text,
    p_order jsonb,
    p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count     int;
    v_valid     int;
    v_distinct  int;
    v_min       int;
    v_max       int;
    v_expected  int;
    v_updated   int;
    v_legacy    boolean;
begin
    if p_order is null or jsonb_typeof(p_order) <> 'array' then
        raise exception '순서 목록이 올바르지 않습니다.' using errcode = '22023';
    end if;

    v_count := jsonb_array_length(p_order);
    if v_count = 0 then
        raise exception '순서 목록이 비어 있습니다.' using errcode = '22023';
    end if;

    -- 동시 순서 변경 직렬화 (마지막 요청이 이전 요청을 덮어쓰도록 순차 적용)
    perform pg_advisory_xact_lock(
        hashtext('team_memberships_sort_order:' || coalesce(p_team_id, ''))
    );

    -- sort_order는 0..n-1의 순열이어야 한다 (중복·누락·음수·소수 차단)
    select count(*),
           count(distinct (e->>'sort_order')::int),
           min((e->>'sort_order')::int),
           max((e->>'sort_order')::int)
      into v_valid, v_distinct, v_min, v_max
      from jsonb_array_elements(p_order) as e
     where jsonb_typeof(e->'sort_order') = 'number'
       and (e->>'sort_order') ~ '^-?[0-9]+$';

    if v_valid <> v_count
       or v_distinct <> v_count
       or v_min <> 0
       or v_max <> v_count - 1 then
        raise exception '순서 값은 0부터 연속된 정수여야 합니다.' using errcode = '22023';
    end if;

    -- 정규화 경로 여부: 팀에 활성 멤버십이 하나도 없으면 레거시 players 경로
    select count(*) into v_expected
      from public.team_memberships
     where team_id = p_team_id and status = 'active';
    v_legacy := v_expected = 0;

    if not v_legacy then
        -- 모든 원소가 uuid 형태의 membership_id를 가져야 한다
        select count(*) into v_valid
          from jsonb_array_elements(p_order) as e
         where jsonb_typeof(e->'membership_id') = 'string'
           and (e->>'membership_id') ~*
               '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        if v_valid <> v_count then
            raise exception '멤버십 ID가 없거나 형식이 올바르지 않은 항목이 있습니다.'
                using errcode = '22023';
        end if;

        select count(distinct (e->>'membership_id')) into v_distinct
          from jsonb_array_elements(p_order) as e;
        if v_distinct <> v_count then
            raise exception '중복된 멤버십 ID가 있습니다.' using errcode = '22023';
        end if;

        -- 제출 집합과 팀의 활성 멤버십 집합이 정확히 일치해야 한다
        if v_expected <> v_count
           or exists (
                select (e->>'membership_id')::uuid from jsonb_array_elements(p_order) as e
                except
                select id from public.team_memberships
                 where team_id = p_team_id and status = 'active'
              ) then
            raise exception '순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.'
                using errcode = '22023';
        end if;

        update public.team_memberships tm
           set sort_order = src.sort_order,
               updated_at = now()
          from (
              select (e->>'membership_id')::uuid as id,
                     (e->>'sort_order')::int     as sort_order
                from jsonb_array_elements(p_order) as e
          ) as src
         where tm.id = src.id
           and tm.team_id = p_team_id;
        get diagnostics v_updated = row_count;

        if v_updated <> v_count then
            raise exception '순서 변경 대상 수가 일치하지 않습니다.' using errcode = '22023';
        end if;

        -- 레거시 players 순번 동기화 (연결된 행이 있는 경우에만)
        update public.players p
           set sort_order = src.sort_order
          from (
              select tm.legacy_player_id      as id,
                     (e->>'sort_order')::int  as sort_order
                from jsonb_array_elements(p_order) as e
                join public.team_memberships tm
                  on tm.id = (e->>'membership_id')::uuid
               where tm.legacy_player_id is not null
          ) as src
         where p.id = src.id
           and p.team_id = p_team_id;
    else
        -- 레거시 경로: players 활성 행 기준으로 검증·갱신
        select count(*) into v_valid
          from jsonb_array_elements(p_order) as e
         where jsonb_typeof(e->'player_id') = 'number'
           and (e->>'player_id') ~ '^[0-9]+$'
           and (e->>'player_id')::bigint > 0;
        if v_valid <> v_count then
            raise exception '구성원 ID가 없거나 형식이 올바르지 않은 항목이 있습니다.'
                using errcode = '22023';
        end if;

        select count(distinct (e->>'player_id')::bigint) into v_distinct
          from jsonb_array_elements(p_order) as e;

        select count(*) into v_expected
          from public.players
         where team_id = p_team_id and status = 'active';

        if v_distinct <> v_count
           or v_expected <> v_count
           or exists (
                select (e->>'player_id')::bigint from jsonb_array_elements(p_order) as e
                except
                select id from public.players
                 where team_id = p_team_id and status = 'active'
              ) then
            raise exception '순서 목록이 팀의 활성 구성원 전체와 일치하지 않습니다.'
                using errcode = '22023';
        end if;

        update public.players p
           set sort_order = src.sort_order
          from (
              select (e->>'player_id')::bigint as id,
                     (e->>'sort_order')::int   as sort_order
                from jsonb_array_elements(p_order) as e
          ) as src
         where p.id = src.id
           and p.team_id = p_team_id;
        get diagnostics v_updated = row_count;

        if v_updated <> v_count then
            raise exception '순서 변경 대상 수가 일치하지 않습니다.' using errcode = '22023';
        end if;
    end if;

    -- 감사 로그도 같은 트랜잭션에서 기록 (V29 미적용 환경은 건너뜀)
    if to_regclass('public.admin_audit_logs') is not null then
        insert into public.admin_audit_logs (
            actor_email, action, team_id, target_type, target_id, target_label, after_state
        ) values (
            p_actor_email,
            'member.reordered',
            p_team_id,
            'team',
            p_team_id,
            '구성원 ' || v_count || '명 순서 변경',
            p_order
        );
    end if;

    return jsonb_build_object('updated', v_count, 'legacy', v_legacy);
end;
$$;

revoke all on function public.admin_reorder_team_members(text, jsonb, text) from public;
grant execute on function public.admin_reorder_team_members(text, jsonb, text) to service_role;

-- ── 3. 정렬 보조 키 인덱스 ─────────────────────────────────────────────────
-- 조회부가 (sort_order, id) 순으로 정렬하므로 동일 순번에서도 결정적 순서를 보장한다.
drop index if exists idx_team_memberships_sort_order;
create index if not exists idx_team_memberships_sort_order
  on public.team_memberships (team_id, sort_order, id);
drop index if exists idx_players_sort_order;
create index if not exists idx_players_sort_order
  on public.players (team_id, sort_order, id);
