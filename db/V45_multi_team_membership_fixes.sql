-- V45: 다팀 멤버십 리뷰 반영 (V43/V44 후속)
--
-- 1. RLS 헬퍼(app_is_team_member/app_is_team_admin)가 players만 확인해서,
--    legacy_player_id 없는 두 번째 이상 팀 멤버십은 그 팀 데이터에 접근 불가.
--    → team_memberships 경로도 인식하도록 확장.
-- 2. V43 역방향 동기화가 players 갱신 시 V31 정방향 트리거를 재발동시켜,
--    'viewer' 같은 매핑 불가 역할이 players.role='member' 왕복 후 유실됨.
--    → 정방향 트리거도 app.player_sync_bypass 를 확인하도록 확장.
-- 3. V44 우회 플래그를 'off'로 하드코딩 — 중첩 호출 시 외부 호출의 우회
--    상태를 조기 해제. → 이전 값을 읽어 복원.
-- 4. 기본 멤버십 삭제·강등(is_default true→false) 시 V43 트리거의
--    when(new.is_default) 조건에 안 걸려 players 가 갱신 안 됨.
--    → 연결된 players 를 정지 상태로 전환(접근 차단, 데이터는 보존).

-- ── 1. RLS 헬퍼 확장 ─────────────────────────────────────────────────────
create or replace function public.app_is_team_member(p_team_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.players p
        where p.team_id = p_team_id
          and p.email = auth.jwt() ->> 'email'
          and p.status = 'active'
    )
    or exists (
        select 1
        from public.team_memberships tm
        join public.profiles pr on pr.id = tm.profile_id
        where tm.team_id = p_team_id
          and tm.status = 'active'
          and pr.account_status = 'active'
          and lower(pr.email) = lower(auth.jwt() ->> 'email')
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
        from public.players p
        where p.team_id = p_team_id
          and p.email = auth.jwt() ->> 'email'
          and p.status = 'active'
          and p.role = 'admin'
    )
    or exists (
        select 1
        from public.team_memberships tm
        join public.profiles pr on pr.id = tm.profile_id
        where tm.team_id = p_team_id
          and tm.status = 'active'
          and tm.role = 'admin'
          and pr.account_status = 'active'
          and lower(pr.email) = lower(auth.jwt() ->> 'email')
    )
$$;

-- ── 2. 정방향 동기화 트리거, 역방향 동기화 중에는 재발동 차단 ─────────────
create or replace function public.sync_legacy_player_identity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- V43 역방향 동기화가 유발한 players 갱신 — 되돌려 쓰면 순환·유실 발생
    if coalesce(current_setting('app.player_sync_bypass', true), '') = 'on' then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if tg_op = 'DELETE' then
        delete from public.team_memberships
        where legacy_player_id = old.id;

        perform public.refresh_legacy_identity_for_email(old.email);
        return old;
    end if;

    if tg_op = 'UPDATE' and old.email is distinct from new.email then
        delete from public.team_memberships
        where legacy_player_id = old.id;

        perform public.refresh_legacy_identity_for_email(old.email);
    end if;

    perform public.sync_legacy_player_identity(new.id);
    return new;
end;
$$;

-- ── 3. 우회 플래그: 이전 값 복원(중첩 호출 안전) ──────────────────────────
create or replace function public.sync_default_membership_to_legacy_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role   text;
    v_status text;
    v_prev_bypass text;
begin
    if not new.is_default or new.legacy_player_id is null then
        return new;
    end if;

    v_role   := case when new.role = 'admin' then 'admin' else 'member' end;
    v_status := case when new.status = 'suspended' then 'suspended' else 'active' end;

    v_prev_bypass := coalesce(current_setting('app.player_sync_bypass', true), 'off');
    perform set_config('app.player_sync_bypass', 'on', true);

    update public.players
    set team_id = new.team_id,
        role    = v_role,
        status  = v_status
    where id = new.legacy_player_id
      and (
          team_id is distinct from new.team_id
          or role is distinct from v_role
          or status is distinct from v_status
      );

    perform set_config('app.player_sync_bypass', v_prev_bypass, true);

    return new;
end;
$$;

-- ── 4. 기본 멤버십 삭제·강등 시 연결 players 정지 ─────────────────────────
create or replace function public.clear_default_membership_from_legacy_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prev_bypass text;
begin
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

drop trigger if exists team_memberships_clear_legacy_player_on_delete on public.team_memberships;
create trigger team_memberships_clear_legacy_player_on_delete
after delete on public.team_memberships
for each row
when (old.is_default)
execute function public.clear_default_membership_from_legacy_player();

drop trigger if exists team_memberships_clear_legacy_player_on_demote on public.team_memberships;
create trigger team_memberships_clear_legacy_player_on_demote
after update of is_default on public.team_memberships
for each row
when (old.is_default and not new.is_default)
execute function public.clear_default_membership_from_legacy_player();
