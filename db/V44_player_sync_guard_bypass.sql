-- V44: players 가드 트리거 내부 동기화 우회
--
-- 배경: V43 역방향 동기화 트리거가 players.role/team_id/status 갱신 시
-- V29 guard_player_sensitive_fields 에 막힘. 이 가드는 auth.jwt() 로
-- 호출자의 관리자 권한을 판정하는데, PostgREST를 거치지 않는 경로
-- (SQL Editor, 트랜잭션 내부 연쇄 트리거)에서는 JWT 컨텍스트가 비어
-- service_role 체크도 통과 못 함.
--
-- 해결: 트랜잭션 로컬 GUC(app.player_sync_bypass) 전용 우회 플래그 도입.
-- V43 동기화 함수가 players 갱신 직전에만 켜고 직후 원복 — 다른 정책·
-- 트리거의 auth.jwt() 판단에는 영향 없음.

create or replace function public.guard_player_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    jwt_role text := coalesce(auth.jwt() ->> 'role', '');
    actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
    actor_is_admin boolean;
begin
    if jwt_role = 'service_role' then
        return new;
    end if;

    -- 내부 동기화 우회 (V43 반영)
    if coalesce(current_setting('app.player_sync_bypass', true), '') = 'on' then
        return new;
    end if;

    if old.role is not distinct from new.role
       and old.status is not distinct from new.status
       and old.team_id is not distinct from new.team_id
       and old.email is not distinct from new.email then
        return new;
    end if;

    select exists (
        select 1
        from public.players p
        where lower(p.email) = actor_email
          and p.status = 'active'
          and p.role = 'admin'
          and (p.team_id = old.team_id or old.team_id is null)
          and (p.team_id = new.team_id or new.team_id is null)
    ) into actor_is_admin;

    if not actor_is_admin then
        raise exception 'Sensitive player fields can only be changed by an administrator'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.guard_player_sensitive_fields() from public;

-- V43 동기화 함수: 갱신 직전 우회 플래그 on, 직후 off
create or replace function public.sync_default_membership_to_legacy_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role   text;
    v_status text;
begin
    if not new.is_default or new.legacy_player_id is null then
        return new;
    end if;

    v_role   := case when new.role = 'admin' then 'admin' else 'member' end;
    v_status := case when new.status = 'suspended' then 'suspended' else 'active' end;

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

    perform set_config('app.player_sync_bypass', 'off', true);

    return new;
end;
$$;

revoke all on function public.sync_default_membership_to_legacy_player() from public;
