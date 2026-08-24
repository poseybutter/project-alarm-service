-- 사용자 프로필, 팀 소속, 접근 요청 정규화 1단계.
-- 기존 기능은 players를 계속 사용하고 이 테이블들은 호환 트리거로 동기화한다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    email text not null unique,
    display_name text not null,
    avatar_url text,
    bio text,
    job_role text,
    account_status text not null default 'pending'
        check (account_status in ('active', 'pending', 'suspended', 'rejected')),
    legacy_primary_player_id bigint unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (email = lower(email))
);

create table if not exists public.team_memberships (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    team_id text not null references public.teams(id) on update cascade on delete restrict,
    role text not null default 'member'
        check (role in ('admin', 'member', 'viewer')),
    status text not null default 'active'
        check (status in ('active', 'suspended')),
    is_default boolean not null default false,
    legacy_player_id bigint unique,
    joined_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id, team_id)
);

create unique index if not exists team_memberships_one_default_idx
    on public.team_memberships (profile_id)
    where is_default;
create index if not exists team_memberships_team_status_idx
    on public.team_memberships (team_id, status);

create table if not exists public.access_requests (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    requested_team_id text references public.teams(id) on update cascade on delete set null,
    assigned_team_id text references public.teams(id) on update cascade on delete set null,
    requested_role text not null default 'member'
        check (requested_role in ('member', 'viewer')),
    assigned_role text
        check (assigned_role in ('admin', 'member', 'viewer')),
    reason text,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'cancelled')),
    source text not null default 'google_oauth',
    reviewed_by_email text,
    requested_at timestamptz not null default now(),
    reviewed_at timestamptz,
    updated_at timestamptz not null default now()
);

create unique index if not exists access_requests_one_pending_idx
    on public.access_requests (profile_id)
    where status = 'pending';
create index if not exists access_requests_status_requested_at_idx
    on public.access_requests (status, requested_at desc);
create index if not exists access_requests_requested_team_idx
    on public.access_requests (requested_team_id, status);

create or replace function public.set_identity_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_identity_updated_at();

drop trigger if exists team_memberships_set_updated_at on public.team_memberships;
create trigger team_memberships_set_updated_at
before update on public.team_memberships
for each row execute function public.set_identity_updated_at();

drop trigger if exists access_requests_set_updated_at on public.access_requests;
create trigger access_requests_set_updated_at
before update on public.access_requests
for each row execute function public.set_identity_updated_at();

create or replace function public.sync_legacy_player_identity(p_player_id bigint)
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

        -- V32는 team_memberships.role_id를 NOT NULL로 강제하고 컬럼 기본값
        -- (default_team_membership_role_id)을 지정해두지만, 그 기본값이 조회하는
        -- 'roles' 시스템 행이 비어있거나 role_id 기본값이 아직 갱신되기 전이면
        -- 기본값 자체가 NULL을 반환해 insert가 NOT NULL 위반으로 실패할 수 있다.
        -- roles/role_id가 존재하면 이 함수가 직접 role_id를 계산해서 넣어
        -- 컬럼 기본값에 의존하지 않도록 한다. V32 적용 전(컬럼이 아직 없는)
        -- 환경도 깨지지 않도록 존재 여부로 분기한다.
        if to_regclass('public.roles') is not null
           and exists (
               select 1 from information_schema.columns
               where table_schema = 'public'
                 and table_name = 'team_memberships'
                 and column_name = 'role_id'
           ) then
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
            set role = excluded.role,
                role_id = coalesce(excluded.role_id, public.team_memberships.role_id),
                status = excluded.status,
                legacy_player_id = coalesce(
                    public.team_memberships.legacy_player_id,
                    excluded.legacy_player_id
                );
        else
            insert into public.team_memberships (
                profile_id,
                team_id,
                role,
                status,
                is_default,
                legacy_player_id
            )
            values (
                v_profile_id,
                v_player.team_id,
                v_role,
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
            set role = excluded.role,
                status = excluded.status,
                legacy_player_id = coalesce(
                    public.team_memberships.legacy_player_id,
                    excluded.legacy_player_id
                );
        end if;
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

revoke all on function public.sync_legacy_player_identity(bigint) from public;

create or replace function public.refresh_legacy_identity_for_email(
    p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile_id uuid;
    v_surviving_player_id bigint;
begin
    if p_email is null then
        return;
    end if;

    select id into v_profile_id
    from public.profiles
    where email = lower(p_email);

    if v_profile_id is null then
        return;
    end if;

    select p.id into v_surviving_player_id
    from public.players p
    where lower(p.email) = lower(p_email)
    order by
        case coalesce(p.status, 'active')
            when 'active' then 0
            when 'pending' then 1
            when 'suspended' then 2
            else 3
        end,
        p.id
    limit 1;

    if v_surviving_player_id is not null then
        update public.profiles
        set legacy_primary_player_id = v_surviving_player_id
        where id = v_profile_id;

        perform public.sync_legacy_player_identity(v_surviving_player_id);
        return;
    end if;

    update public.profiles
    set account_status = 'suspended',
        legacy_primary_player_id = null
    where id = v_profile_id;

    update public.access_requests
    set status = 'cancelled',
        updated_at = now()
    where profile_id = v_profile_id
      and status = 'pending';
end;
$$;

revoke all on function public.refresh_legacy_identity_for_email(text) from public;

create or replace function public.sync_legacy_player_identity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

revoke all on function public.sync_legacy_player_identity_trigger() from public;

drop trigger if exists players_sync_normalized_identity on public.players;
create trigger players_sync_normalized_identity
after insert or update of name, email, avatar_url, bio, job_role, team_id, role, status
or delete on public.players
for each row execute function public.sync_legacy_player_identity_trigger();

-- 기존 players 데이터를 신규 구조로 최초 이관한다.
select public.sync_legacy_player_identity(p.id)
from public.players p
where p.email is not null;

alter table public.profiles enable row level security;
alter table public.team_memberships enable row level security;
alter table public.access_requests enable row level security;

create or replace function public.identity_is_organization_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.organization_admins oa
        where oa.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.identity_owns_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = p_profile_id
          and p.auth_user_id = auth.uid()
    );
$$;

create or replace function public.identity_admin_can_read_profile(
    p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.identity_is_organization_admin()
       or exists (
            select 1
            from public.team_memberships target_membership
            join public.players actor
              on actor.team_id = target_membership.team_id
            where target_membership.profile_id = p_profile_id
              and lower(actor.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
              and actor.status = 'active'
              and actor.role = 'admin'
       );
$$;

revoke all on function public.identity_is_organization_admin() from public;
revoke all on function public.identity_owns_profile(uuid) from public;
revoke all on function public.identity_admin_can_read_profile(uuid) from public;
grant execute on function public.identity_is_organization_admin() to authenticated;
grant execute on function public.identity_owns_profile(uuid) to authenticated;
grant execute on function public.identity_admin_can_read_profile(uuid) to authenticated;

drop policy if exists "profiles readable by owner or admins" on public.profiles;
create policy "profiles readable by owner or admins"
on public.profiles for select to authenticated
using (
    auth_user_id = auth.uid()
    or public.identity_admin_can_read_profile(id)
);

drop policy if exists "memberships readable by owner or admins"
on public.team_memberships;
create policy "memberships readable by owner or admins"
on public.team_memberships for select to authenticated
using (
    public.identity_owns_profile(profile_id)
    or public.identity_is_organization_admin()
    or public.app_is_team_admin(team_id)
);

drop policy if exists "access requests readable by owner or admins"
on public.access_requests;
create policy "access requests readable by owner or admins"
on public.access_requests for select to authenticated
using (
    public.identity_owns_profile(profile_id)
    or public.identity_is_organization_admin()
    or public.app_is_team_admin(
        coalesce(assigned_team_id, requested_team_id)
    )
);

drop policy if exists "access requests insertable by owner"
on public.access_requests;
create policy "access requests insertable by owner"
on public.access_requests for insert to authenticated
with check (
    status = 'pending'
    and public.identity_owns_profile(profile_id)
);

grant select on public.profiles to authenticated;
grant select on public.team_memberships to authenticated;
grant select, insert on public.access_requests to authenticated;
grant all on public.profiles to service_role;
grant all on public.team_memberships to service_role;
grant all on public.access_requests to service_role;

-- 적용 결과 요약. 세 수치는 기존 활성/대기 사용자 및 소속 현황과 대조한다.
select 'profiles' as entity, count(*) as row_count from public.profiles
union all
select 'team_memberships', count(*) from public.team_memberships
union all
select 'pending_access_requests', count(*) from public.access_requests where status = 'pending';
