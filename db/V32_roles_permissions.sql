-- 역할과 권한을 분리하고 팀 소속에 역할을 연결한다.
-- players.role은 기존 화면/RLS 호환용으로 유지하며 신규 권한 판정은 이 구조를 우선한다.

create extension if not exists pgcrypto;

create table if not exists public.permissions (
    key text primary key,
    name text not null,
    description text,
    category text not null,
    risk_level text not null default 'normal'
        check (risk_level in ('normal', 'sensitive', 'critical')),
    created_at timestamptz not null default now()
);

create table if not exists public.roles (
    id uuid primary key default gen_random_uuid(),
    team_id text references public.teams(id) on update cascade on delete restrict,
    role_key text not null,
    name text not null,
    description text,
    is_system boolean not null default false,
    status text not null default 'active'
        check (status in ('active', 'archived')),
    created_by_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (role_key ~ '^[a-z][a-z0-9_]{1,39}$'),
    check (not is_system or team_id is null)
);

create unique index if not exists roles_scope_key_idx
    on public.roles (coalesce(team_id, '__system__'), role_key);
create index if not exists roles_team_status_idx
    on public.roles (team_id, status);

create table if not exists public.role_permissions (
    role_id uuid not null references public.roles(id) on delete cascade,
    permission_key text not null references public.permissions(key) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (role_id, permission_key)
);

alter table public.team_memberships
    add column if not exists role_id uuid references public.roles(id) on delete restrict;

create index if not exists team_memberships_role_id_idx
    on public.team_memberships (role_id);

insert into public.permissions (key, name, description, category, risk_level)
values
    ('admin.read', '관리자 영역 조회', '팀 관리자 화면과 운영 요약을 조회합니다.', '운영', 'normal'),
    ('requests.review', '접근 요청 검토', '신규 접근 요청을 승인하거나 거절합니다.', '구성원', 'sensitive'),
    ('members.read', '구성원 조회', '팀 구성원과 상태를 조회합니다.', '구성원', 'normal'),
    ('members.manage', '구성원 관리', '구성원 상태와 역할을 변경합니다.', '구성원', 'critical'),
    ('teams.read', '팀 조회', '팀 설정과 운영 현황을 조회합니다.', '팀', 'normal'),
    ('teams.manage', '팀 관리', '팀 정보를 변경하고 보관합니다.', '팀', 'critical'),
    ('roles.read', '역할·권한 조회', '역할과 권한 매트릭스를 조회합니다.', '보안', 'normal'),
    ('roles.manage', '역할·권한 관리', '커스텀 역할과 권한 구성을 변경합니다.', '보안', 'critical'),
    ('audit.read', '감사 로그 조회', '관리자 변경 이력을 조회합니다.', '보안', 'sensitive'),
    ('integrations.read', '연동 조회', '캘린더·Chat 연동 상태를 조회합니다.', '연동', 'normal'),
    ('integrations.manage', '연동 관리', '팀 연동 설정을 변경합니다.', '연동', 'sensitive')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    risk_level = excluded.risk_level;

insert into public.roles (
    team_id,
    role_key,
    name,
    description,
    is_system
)
select null, seed.role_key, seed.name, seed.description, true
from (
    values
        ('team_admin', '팀 관리자', '팀 운영과 구성원을 관리하는 시스템 역할'),
        ('team_member', '구성원', '팀 업무를 수행하는 기본 시스템 역할'),
        ('team_viewer', '뷰어', '팀 정보를 읽기 전용으로 이용하는 시스템 역할')
) as seed(role_key, name, description)
where not exists (
    select 1
    from public.roles role
    where role.team_id is null
      and role.role_key = seed.role_key
);

insert into public.role_permissions (role_id, permission_key)
select role.id, permission.key
from public.roles role
cross join public.permissions permission
where role.team_id is null
  and role.role_key = 'team_admin'
on conflict do nothing;

-- V31의 players 동기화 트리거는 새 membership을 먼저 만들 수 있다.
-- 역할 기본값을 제공해 V32 적용 이후에도 NOT NULL 계약을 지킨다.
create or replace function public.default_team_membership_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id
    from public.roles
    where team_id is null
      and role_key = 'team_member'
    limit 1
$$;

alter table public.team_memberships
    alter column role_id set default public.default_team_membership_role_id();

update public.team_memberships membership
set role_id = role.id
from public.roles role
where membership.role_id is null
  and role.team_id is null
  and role.role_key = case
      when membership.role = 'admin' then 'team_admin'
      when membership.role = 'viewer' then 'team_viewer'
      else 'team_member'
  end;

alter table public.team_memberships
    alter column role_id set not null;

drop trigger if exists roles_set_updated_at on public.roles;
create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_identity_updated_at();

create or replace function public.sync_legacy_membership_role_binding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role_key text;
begin
    if tg_op = 'UPDATE'
       and old.role is not distinct from new.role
       and old.team_id is not distinct from new.team_id then
        return new;
    end if;

    v_role_key := case
        when new.role = 'admin' then 'team_admin'
        when new.role = 'viewer' then 'team_viewer'
        else 'team_member'
    end;

    update public.team_memberships membership
    set role_id = role.id
    from public.roles role
    where membership.legacy_player_id = new.id
      and (
          membership.role_id is null
          or exists (
              select 1 from public.roles current_role
              where current_role.id = membership.role_id
                and current_role.is_system
          )
      )
      and role.team_id is null
      and role.role_key = v_role_key;

    return new;
end;
$$;

revoke all on function public.sync_legacy_membership_role_binding() from public;

drop trigger if exists players_sync_zz_membership_role on public.players;
create trigger players_sync_zz_membership_role
after insert or update of role, team_id on public.players
for each row execute function public.sync_legacy_membership_role_binding();

create or replace function public.admin_update_member_access(
    p_player_id bigint,
    p_role_id uuid default null,
    p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player public.players%rowtype;
    v_membership public.team_memberships%rowtype;
    v_role public.roles%rowtype;
    v_legacy_role text;
    v_membership_role text;
begin
    if p_status is not null and p_status not in ('active', 'suspended') then
        raise exception 'Unsupported member status' using errcode = '22023';
    end if;

    select * into v_player
    from public.players
    where id = p_player_id
    for update;

    if not found then
        raise exception 'Player not found' using errcode = 'P0002';
    end if;

    select * into v_membership
    from public.team_memberships
    where legacy_player_id = p_player_id
    for update;

    if not found then
        raise exception 'Membership not found' using errcode = 'P0002';
    end if;

    if p_role_id is not null then
        select * into v_role
        from public.roles
        where id = p_role_id
          and status = 'active'
          and (team_id is null or team_id = v_membership.team_id);

        if not found then
            raise exception 'Role is not available for this team'
                using errcode = '22023';
        end if;

        v_legacy_role := case
            when v_role.team_id is null and v_role.role_key = 'team_admin'
                then 'admin'
            else 'member'
        end;
        v_membership_role := case
            when v_role.team_id is null and v_role.role_key = 'team_admin'
                then 'admin'
            when v_role.team_id is null and v_role.role_key = 'team_viewer'
                then 'viewer'
            else 'member'
        end;
    end if;

    update public.players
    set role = coalesce(v_legacy_role, role),
        status = coalesce(p_status, status)
    where id = p_player_id;

    select * into v_membership
    from public.team_memberships
    where legacy_player_id = p_player_id
    for update;

    update public.team_memberships
    set role_id = coalesce(p_role_id, role_id),
        role = coalesce(v_membership_role, role),
        status = case
            when p_status = 'suspended' then 'suspended'
            when p_status = 'active' then 'active'
            else status
        end
    where id = v_membership.id
    returning * into v_membership;

    return jsonb_build_object(
        'player_id', v_player.id,
        'membership_id', v_membership.id,
        'team_id', v_membership.team_id,
        'role_id', v_membership.role_id,
        'status', v_membership.status
    );
end;
$$;

revoke all on function public.admin_update_member_access(bigint, uuid, text)
from public;
grant execute on function public.admin_update_member_access(bigint, uuid, text)
to service_role;

create or replace function public.admin_save_role(
    p_role_id uuid,
    p_team_id text,
    p_role_key text,
    p_name text,
    p_description text,
    p_permission_keys text[],
    p_actor_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role_id uuid;
    v_unknown_permissions text[];
begin
    if p_team_id is null or not exists (
        select 1 from public.teams where id = p_team_id and status = 'active'
    ) then
        raise exception 'Active team not found' using errcode = '22023';
    end if;
    if p_role_key is null or p_role_key !~ '^[a-z][a-z0-9_]{1,39}$' then
        raise exception 'Invalid role key' using errcode = '22023';
    end if;
    if nullif(trim(p_name), '') is null or length(trim(p_name)) > 40 then
        raise exception 'Invalid role name' using errcode = '22023';
    end if;

    select array_agg(requested.permission_key) into v_unknown_permissions
    from unnest(coalesce(p_permission_keys, array[]::text[]))
        as requested(permission_key)
    where not exists (
        select 1 from public.permissions permission
        where permission.key = requested.permission_key
    );

    if v_unknown_permissions is not null then
        raise exception 'Unknown permissions: %', v_unknown_permissions
            using errcode = '22023';
    end if;

    if p_role_id is null then
        insert into public.roles (
            team_id,
            role_key,
            name,
            description,
            is_system,
            created_by_email
        )
        values (
            p_team_id,
            p_role_key,
            trim(p_name),
            nullif(trim(p_description), ''),
            false,
            lower(p_actor_email)
        )
        returning id into v_role_id;
    else
        update public.roles
        set role_key = p_role_key,
            name = trim(p_name),
            description = nullif(trim(p_description), '')
        where id = p_role_id
          and team_id = p_team_id
          and not is_system
          and status = 'active'
        returning id into v_role_id;

        if v_role_id is null then
            raise exception 'Editable role not found' using errcode = 'P0002';
        end if;

        delete from public.role_permissions
        where role_id = v_role_id;
    end if;

    insert into public.role_permissions (role_id, permission_key)
    select v_role_id, requested.permission_key
    from unnest(coalesce(p_permission_keys, array[]::text[]))
        as requested(permission_key)
    on conflict do nothing;

    return v_role_id;
exception
    when unique_violation then
        raise exception 'Role key already exists in this team'
            using errcode = '23505';
end;
$$;

drop function if exists public.admin_delete_role(uuid);
create or replace function public.admin_delete_role(
    p_role_id uuid,
    p_team_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1
        from public.team_memberships membership
        where membership.role_id = p_role_id
          and membership.team_id = p_team_id
    ) then
        raise exception 'Role is assigned to members' using errcode = '23503';
    end if;

    delete from public.roles
    where id = p_role_id
      and team_id = p_team_id
      and not is_system;

    if not found then
        raise exception 'Deletable role not found' using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.admin_save_role(
    uuid, text, text, text, text, text[], text
) from public;
revoke all on function public.admin_delete_role(uuid, text) from public;
grant execute on function public.admin_save_role(
    uuid, text, text, text, text, text[], text
) to service_role;
grant execute on function public.admin_delete_role(uuid, text) to service_role;

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "permissions readable by members" on public.permissions;
create policy "permissions readable by members"
on public.permissions for select to authenticated
using (true);

drop policy if exists "roles readable by scoped members" on public.roles;
create policy "roles readable by scoped members"
on public.roles for select to authenticated
using (
    team_id is null
    or public.identity_is_organization_admin()
    or public.app_is_team_admin(team_id)
    or exists (
        select 1
        from public.team_memberships membership
        where membership.team_id = roles.team_id
          and membership.status = 'active'
          and public.identity_owns_profile(membership.profile_id)
    )
);

drop policy if exists "role permissions readable by scoped members"
on public.role_permissions;
create policy "role permissions readable by scoped members"
on public.role_permissions for select to authenticated
using (
    exists (
        select 1
        from public.roles role
        where role.id = role_permissions.role_id
    )
);

grant select on public.permissions to authenticated;
grant select on public.roles to authenticated;
grant select on public.role_permissions to authenticated;
grant all on public.permissions to service_role;
grant all on public.roles to service_role;
grant all on public.role_permissions to service_role;

select 'permissions' as entity, count(*) as row_count from public.permissions
union all
select 'roles', count(*) from public.roles
union all
select 'role_permissions', count(*) from public.role_permissions
union all
select 'memberships_without_role', count(*)
from public.team_memberships
where role_id is null;
