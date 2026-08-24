-- 관리자 영역 1차 기반.
-- 기존 players 기반 업무 기능을 유지하면서 팀 메타데이터와 변경 감사 로그를 추가한다.

create extension if not exists pgcrypto;

create table if not exists public.teams (
    id text primary key,
    name text not null,
    description text,
    status text not null default 'active'
        check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);

-- 레거시 teams 테이블이 이미 있으면 create table if not exists만으로는
-- 신규 컬럼이 추가되지 않으므로 컬럼 단위로 보강한다.
alter table public.teams
    add column if not exists description text,
    add column if not exists status text not null default 'active',
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now(),
    add column if not exists archived_at timestamptz;

-- 샘플 팀을 만들지 않고 실제 구성원이 소속된 기존 팀만 이관한다.
insert into public.teams (id, name, description)
select distinct
    p.team_id,
    case when p.team_id = 'ud2' then '퍼블리싱팀' else p.team_id end,
    case when p.team_id = 'ud2' then '기존 UD2 퍼블리싱팀' else null end
from public.players p
where p.team_id is not null
on conflict (id) do nothing;

create table if not exists public.organization_admins (
    email text primary key,
    assigned_by text,
    created_at timestamptz not null default now(),
    check (email = lower(email))
);

-- 현재 단일 팀의 기존 관리자는 조직 관리자 초기값으로 한 번만 이관한다.
-- 이후 추가되는 팀 관리자는 자동으로 조직 관리자가 되지 않는다.
insert into public.organization_admins (email)
select distinct lower(email)
from public.players
where role = 'admin'
  and status = 'active'
  and email is not null
on conflict (email) do nothing;

create table if not exists public.admin_audit_logs (
    id uuid primary key default gen_random_uuid(),
    team_id text references public.teams(id) on update cascade on delete set null,
    actor_email text not null,
    action text not null,
    target_type text not null,
    target_id text not null,
    target_label text,
    before_state jsonb,
    after_state jsonb,
    created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
    on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_team_created_at_idx
    on public.admin_audit_logs (team_id, created_at desc);

alter table public.teams enable row level security;
alter table public.organization_admins enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "organization admins readable by self"
on public.organization_admins;
create policy "organization admins readable by self"
on public.organization_admins for select to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "teams readable by active members" on public.teams;
create policy "teams readable by active members"
on public.teams for select to authenticated
using (
    exists (
        select 1 from public.players p
        where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and p.status = 'active'
    )
);

drop policy if exists "teams managed by admins" on public.teams;
create policy "teams managed by admins"
on public.teams for all to authenticated
using (
    exists (
        select 1 from public.organization_admins oa
        where oa.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
)
with check (
    exists (
        select 1 from public.organization_admins oa
        where oa.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
);

drop policy if exists "admin audit logs readable by admins"
on public.admin_audit_logs;
create policy "admin audit logs readable by admins"
on public.admin_audit_logs for select to authenticated
using (
    exists (
        select 1 from public.organization_admins oa
        where oa.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
        select 1 from public.players p
        where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and p.status = 'active'
          and p.role = 'admin'
          and p.team_id = admin_audit_logs.team_id
    )
);

-- V28의 본인 행 UPDATE 정책은 role/status/team_id까지 바꿀 수 있다.
-- 프로필용 일반 UPDATE는 유지하되 민감 필드 변경만 서버 관리자 또는 service_role로 제한한다.
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
    ) into actor_is_admin;

    if not actor_is_admin then
        raise exception 'Sensitive player fields can only be changed by an administrator'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.guard_player_sensitive_fields() from public;

drop trigger if exists players_guard_sensitive_fields on public.players;
create trigger players_guard_sensitive_fields
before update on public.players
for each row execute function public.guard_player_sensitive_fields();

grant select on public.teams to authenticated;
grant select on public.organization_admins to authenticated;
grant select on public.admin_audit_logs to authenticated;

select id, name, status from public.teams order by name;
