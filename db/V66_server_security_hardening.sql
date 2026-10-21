-- V66: 서버 보안 강화 — 프로필-인증 사용자 연결 백필, TOTP 재사용 방지, 칭호 원자적 추가
--
-- 발견 사항:
--  1. 관리자가 먼저 만든 프로필(로그인 이력 없음)은 profiles.auth_user_id 가 NULL 로 남아
--     auth.uid() 기반 RLS(identity_owns_profile 등)가 본인 행을 인식하지 못한다.
--     (앱은 auth/callback 에서 로그인 시 연결하도록 수정됨 — 여기서는 기존 행 일괄 백필)
--  2. TOTP 코드는 window=1(±30초)로 검증되어 같은 코드를 90초 동안 재사용할 수 있었다.
--     마지막으로 사용한 time-step 을 DB 에 저장해 같은/이전 step 코드를 거부한다.
--     (인메모리 저장은 서버리스 인스턴스마다 따로라 재사용을 막지 못한다)
--  3. 시즌 종료 시 players.icons 를 읽고-쓰기(read-modify-write)로 누적해
--     동시 실행 시 칭호가 유실될 수 있었다. 단일 UPDATE 로 append 하는 함수를 추가한다.

-- ═══ 1. profiles.auth_user_id 백필 ═════════════════════════════════════
-- 같은 이메일의 auth.users 가 여럿이면 가장 먼저 만들어진 계정에 연결한다.
-- 이미 다른 프로필에 연결된 auth 사용자는 건너뛴다 (auth_user_id unique).

update public.profiles p
set auth_user_id = u.id
from (
    select distinct on (lower(email)) id, lower(email) as email
    from auth.users
    where email is not null
    order by lower(email), created_at
) u
where p.auth_user_id is null
  and p.email = u.email
  and not exists (
      select 1 from public.profiles linked where linked.auth_user_id = u.id
  );

-- ═══ 2. TOTP time-step 재사용 방지 ════════════════════════════════════
-- 앱은 검증 성공 시
--   update totp_secrets set last_used_step = :step
--   where id = :id and (last_used_step is null or last_used_step < :step)
-- 를 실행해 갱신된 행이 없으면 재사용으로 거부한다 (동시 요청도 하나만 성공).

alter table public.totp_secrets
    add column if not exists last_used_step bigint;

comment on column public.totp_secrets.last_used_step is
    '마지막으로 사용된 TOTP time-step(floor(epoch/30)). 같은/이전 step 코드 재사용 거부용';

-- V62 와 동일하게 service_role 전용 유지 (재확인)
alter table public.totp_secrets enable row level security;
alter table public.totp_secrets force row level security;
revoke all on table public.totp_secrets from anon, authenticated;
grant all on table public.totp_secrets to service_role;

-- ═══ 3. players.icons 원자적 append ═══════════════════════════════════
-- icons 컬럼 타입(text[] / jsonb / json)에 맞춰 단일 UPDATE 로 추가한다.
-- plpgsql 은 실행되는 분기만 계획하므로 다른 타입 분기는 오류가 나지 않는다.

create or replace function public.append_player_icon(
    p_player_id bigint,
    p_icon text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_type text;
    v_count integer;
begin
    if p_icon is null or length(trim(p_icon)) = 0 then
        raise exception 'p_icon is required' using errcode = '22023';
    end if;

    select data_type into v_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'icons';

    -- V55 점수 컬럼 가드 트리거 우회 (트랜잭션 로컬)
    perform set_config('app.score_write_bypass', 'on', true);

    if v_type = 'ARRAY' then
        update public.players
        set icons = array_append(coalesce(icons, '{}'), p_icon)
        where id = p_player_id;
    elsif v_type = 'jsonb' then
        update public.players
        set icons = coalesce(icons, '[]'::jsonb) || jsonb_build_array(p_icon)
        where id = p_player_id;
    elsif v_type = 'json' then
        update public.players
        set icons = (coalesce(icons::jsonb, '[]'::jsonb) || jsonb_build_array(p_icon))::json
        where id = p_player_id;
    else
        raise exception 'unsupported players.icons type: %', coalesce(v_type, 'missing');
    end if;

    get diagnostics v_count = row_count;
    perform set_config('app.score_write_bypass', '', true);
    return v_count > 0;
end;
$$;

revoke execute on function public.append_player_icon(bigint, text)
from public, anon, authenticated;
grant execute on function public.append_player_icon(bigint, text)
to service_role;

-- ═══ 검증 (적용 직후 SQL 에디터에서 실행) ═══════════════════════════
--
-- 1) 연결되지 않은 프로필 중 같은 이메일의 auth 사용자가 있는 행 (0 이어야 함):
-- select count(*) from public.profiles p
-- join auth.users u on lower(u.email) = p.email
-- where p.auth_user_id is null;
--
-- 2) last_used_step 컬럼 존재:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'totp_secrets' and column_name = 'last_used_step';
--
-- 3) authenticated 가 append_player_icon 을 못 부르는지 (false 여야 함):
-- select has_function_privilege('authenticated',
--        'public.append_player_icon(bigint, text)', 'execute');
