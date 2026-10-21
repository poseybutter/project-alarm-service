-- V63: 권한 상승 경로 차단 — 정의자 함수 실행 권한·역할 동기화·점수 우회
--
-- 발견 사항:
--  C1. V61 admin_add/remove_team_membership 에 revoke/grant 가 없어
--      authenticated(anon 포함)가 직접 호출해 임의 팀의 admin 이 될 수 있음
--  C2. V31/V32/V49/V54/V35 정의자 함수가 PUBLIC 만 revoke 했음.
--      Supabase 는 public 스키마 함수에 anon/authenticated 를 직접 grant 하므로
--      PUBLIC revoke 만으로는 막히지 않는다 (V55 §0 과 같은 함정)
--  C3. players 의 이름·아바타 등만 바뀌어도 sync_legacy_player_identity 가
--      기존 멤버십의 role/role_id 를 players.role(admin|member)로 덮어써
--      viewer → member 승격, admin 강등, 커스텀 역할 초기화가 발생
--  C4. tasks/quests.status 를 직접 UPDATE 할 수 있어 점수 RPC 를 우회
--      (완료 RPC +EXP → 직접 '대기' → 다시 완료 RPC 반복으로 EXP 무한 적립)
--  H1. teams SELECT 정책이 players 경로만 봐서 멤버십만 있는 팀이 안 보임

-- ═══ 1. 정의자 함수 실행 권한 회수 (C1, C2) ═══════════════════════════
-- 모두 서버(service_role) 또는 트리거·pg_cron 에서만 호출된다.
-- 트리거/정의자 함수 내부 호출은 소유자 권한으로 검사되므로 영향 없다.

do $$
declare fn record;
begin
    for fn in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
              'admin_add_team_membership',
              'admin_remove_team_membership',
              'admin_save_role',
              'admin_delete_role',
              'admin_update_member_access',
              'admin_reorder_team_members',
              'consume_rate_limit',
              'purge_expired_agent_security_data',
              'refresh_legacy_identity_for_email',
              'close_season'
          )
    loop
        execute format(
            'revoke execute on function %s from public, anon, authenticated',
            fn.sig
        );
        execute format('grant execute on function %s to service_role', fn.sig);
    end loop;
end $$;

-- ═══ 2. 역할 동기화가 기존 멤버십 역할을 덮어쓰지 않도록 (C3) ══════════
-- p_sync_role = true 는 players.role/team_id 가 실제로 바뀐 경우에만 넘긴다.
-- 그 외(이름·아바타·소개 변경, INSERT 시 이미 존재하는 멤버십)는
-- 멤버십의 role/role_id 를 보존한다. 새 멤버십은 기존과 같이 생성된다.

drop function if exists public.sync_legacy_player_identity(bigint);

create or replace function public.sync_legacy_player_identity(
    p_player_id bigint,
    p_sync_role boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_player public.players%rowtype;
    v_profile_id uuid;
    v_auth_user_id uuid;
    v_account_status text;
    v_role text;
    v_membership_status text;
begin
    select * into v_player
    from public.players
    where id = p_player_id;

    if not found or v_player.email is null then
        return;
    end if;

    select u.id into v_auth_user_id
    from auth.users u
    where lower(u.email) = lower(v_player.email)
    order by u.created_at
    limit 1;

    select case
        when bool_or(coalesce(p.status, 'active') = 'active') then 'active'
        when bool_or(p.status = 'pending') then 'pending'
        when bool_or(p.status = 'suspended') then 'suspended'
        else 'rejected'
    end
    into v_account_status
    from public.players p
    where lower(p.email) = lower(v_player.email);

    insert into public.profiles (
        auth_user_id,
        email,
        display_name,
        avatar_url,
        bio,
        job_role,
        account_status,
        legacy_primary_player_id
    )
    values (
        v_auth_user_id,
        lower(v_player.email),
        coalesce(nullif(trim(v_player.name), ''), split_part(v_player.email, '@', 1)),
        v_player.avatar_url,
        v_player.bio,
        v_player.job_role,
        coalesce(v_account_status, 'pending'),
        v_player.id
    )
    on conflict (email) do update
    set auth_user_id = coalesce(public.profiles.auth_user_id, excluded.auth_user_id),
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        bio = excluded.bio,
        job_role = excluded.job_role,
        account_status = excluded.account_status,
        legacy_primary_player_id = coalesce(
            public.profiles.legacy_primary_player_id,
            excluded.legacy_primary_player_id
        )
    returning id into v_profile_id;

    delete from public.team_memberships
    where legacy_player_id = v_player.id
      and (
          v_player.team_id is null
          or team_id is distinct from v_player.team_id
          or coalesce(v_player.status, 'active') not in ('active', 'suspended')
      );

    if v_player.team_id is not null
       and coalesce(v_player.status, 'active') in ('active', 'suspended') then
        v_role := case
            when v_player.role = 'admin' then 'admin'
            else 'member'
        end;
        v_membership_status := case
            when v_player.status = 'suspended' then 'suspended'
            else 'active'
        end;

        insert into public.team_memberships (
            profile_id,
            team_id,
            role,
            role_id,
            status,
            is_default,
            legacy_player_id
        )
        values (
            v_profile_id,
            v_player.team_id,
            v_role,
            (
                select role.id
                from public.roles role
                where role.team_id is null
                  and role.role_key = case
                      when v_role = 'admin' then 'team_admin'
                      else 'team_member'
                  end
            ),
            v_membership_status,
            not exists (
                select 1
                from public.team_memberships tm
                where tm.profile_id = v_profile_id
                  and tm.is_default
            ),
            v_player.id
        )
        on conflict (profile_id, team_id) do update
        set role = case
                when p_sync_role then excluded.role
                else public.team_memberships.role
            end,
            role_id = case
                when p_sync_role
                    then coalesce(excluded.role_id, public.team_memberships.role_id)
                else public.team_memberships.role_id
            end,
            status = excluded.status,
            legacy_player_id = coalesce(
                public.team_memberships.legacy_player_id,
                excluded.legacy_player_id
            );
    end if;

    if v_player.status = 'pending' then
        insert into public.access_requests (
            profile_id,
            requested_team_id,
            requested_role,
            status,
            source
        )
        values (
            v_profile_id,
            v_player.team_id,
            'member',
            'pending',
            'legacy_players'
        )
        on conflict (profile_id) where status = 'pending' do update
        set requested_team_id = excluded.requested_team_id,
            updated_at = now();
    elsif v_player.status = 'active' then
        update public.access_requests
        set status = 'approved',
            assigned_team_id = v_player.team_id,
            assigned_role = v_role,
            reviewed_at = coalesce(reviewed_at, now())
        where profile_id = v_profile_id
          and status = 'pending';
    elsif v_player.status = 'rejected' then
        update public.access_requests
        set status = 'rejected',
            reviewed_at = coalesce(reviewed_at, now())
        where profile_id = v_profile_id
          and status = 'pending';
    end if;
end;
$$;

revoke execute on function public.sync_legacy_player_identity(bigint, boolean)
from public, anon, authenticated;
grant execute on function public.sync_legacy_player_identity(bigint, boolean)
to service_role;

-- V45 트리거 함수 재정의: 역할·팀이 실제로 바뀐 UPDATE 에서만 역할 동기화
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

    perform public.sync_legacy_player_identity(
        new.id,
        tg_op = 'UPDATE'
            and (old.role is distinct from new.role
                 or old.team_id is distinct from new.team_id)
    );
    return new;
end;
$$;

revoke execute on function public.sync_legacy_player_identity_trigger()
from public, anon, authenticated;

-- V32 역할 바인딩 트리거: INSERT 시 이미 있던 멤버십의 역할까지 덮어쓰지 않도록
-- UPDATE(역할·팀 변경)에서만 동작하게 한다. 새 멤버십은 위 함수가 시스템
-- 역할로 생성하므로 INSERT 경로의 바인딩이 필요 없다.
drop trigger if exists players_sync_zz_membership_role on public.players;
create trigger players_sync_zz_membership_role
after update of role, team_id on public.players
for each row execute function public.sync_legacy_membership_role_binding();

-- ═══ 3. tasks/quests.status 직접 변경 차단 (C4) ═══════════════════════
-- 상태 변경은 set_task_status / set_quest_done(정의자 함수)만 허용한다.
-- 정의자 함수 안에서는 current_user 가 함수 소유자이므로 통과하고,
-- 클라이언트 직접 UPDATE(current_user = authenticated/anon)만 막힌다.
-- service_role(서버 API)·마이그레이션도 통과한다.

create or replace function public.guard_direct_status_change_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.status is distinct from old.status
       and current_user in ('authenticated', 'anon') then
        raise exception '상태 변경은 점수 RPC(set_task_status/set_quest_done)를 통해서만 가능합니다'
            using errcode = 'insufficient_privilege';
    end if;
    return new;
end;
$$;

drop trigger if exists tasks_guard_direct_status_change on public.tasks;
create trigger tasks_guard_direct_status_change
    before update of status on public.tasks
    for each row
    execute function public.guard_direct_status_change_fn();

drop trigger if exists quests_guard_direct_status_change on public.quests;
create trigger quests_guard_direct_status_change
    before update of status on public.quests
    for each row
    execute function public.guard_direct_status_change_fn();

-- ═══ 4. teams SELECT 를 멤버십 경로까지 확장 (H1) ═════════════════════

drop policy if exists "teams readable by active members" on public.teams;
create policy "teams readable by active members"
on public.teams for select to authenticated
using (id in (select public.app_member_team_ids()));

-- ═══ 검증 (적용 직후 SQL 에디터에서 실행) ═══════════════════════════
--
-- 1) authenticated/anon 이 관리 함수를 못 부르는지 (모두 false 여야 함):
-- select p.proname,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('admin_add_team_membership', 'admin_remove_team_membership',
--                     'admin_save_role', 'admin_delete_role', 'admin_update_member_access',
--                     'admin_reorder_team_members', 'consume_rate_limit',
--                     'sync_legacy_player_identity', 'refresh_legacy_identity_for_email');
--
-- 2) 아바타 변경이 viewer 역할을 보존하는지:
-- begin;
-- update public.team_memberships set role = 'viewer' where legacy_player_id = <player_id>;
-- update public.players set avatar_url = 'x' where id = <player_id>;
-- select role, role_id from public.team_memberships where legacy_player_id = <player_id>;  -- viewer 유지
-- rollback;
--
-- 3) 직접 상태 변경이 막히는지 (오류가 나면 정상):
-- begin;
-- set local role authenticated;
-- select set_config('request.jwt.claims', '{"email":"<본인 이메일>","role":"authenticated"}', true);
-- update public.tasks set status = '대기' where id = <내 완료 업무 id>;
-- rollback;