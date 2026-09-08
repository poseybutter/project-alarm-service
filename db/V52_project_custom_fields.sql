-- V52: 프로젝트 커스텀 필드 (동적 컬럼 + 민감 정보 암호화 + 변경 이력)
--
-- 팀별로 프로젝트에 자유롭게 커스텀 컬럼을 추가/수정/삭제/순서변경할 수 있다.
-- field_type = 'secret' 인 필드는 서버에서 AES-256-GCM 암호화 후 저장한다.
-- 모든 값 변경은 project_field_history에 diff로 기록된다.

-- ──────────────────────────────────────────────
-- 1. 필드 정의 (어떤 컬럼이 존재하는지)
-- ──────────────────────────────────────────────
create table if not exists public.project_field_definitions (
    id          bigint generated always as identity primary key,
    team_id     text not null references public.teams(id) on delete cascade,
    name        text not null,
    label       text not null,
    field_type  text not null default 'text'
                check (field_type in ('text', 'url', 'secret', 'textarea', 'select')),
    sort_order  int not null default 0,
    is_required boolean not null default false,
    options     jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint project_field_definitions_team_name_uq unique (team_id, name)
);

create index if not exists project_field_definitions_team_order_idx
    on public.project_field_definitions (team_id, sort_order);

-- ──────────────────────────────────────────────
-- 2. 필드 값 (프로젝트별 실제 데이터)
-- ──────────────────────────────────────────────
create table if not exists public.project_field_values (
    id              bigint generated always as identity primary key,
    team_id         text not null references public.teams(id) on delete cascade,
    project_id      bigint not null references public.projects(id) on delete cascade,
    field_def_id    bigint not null references public.project_field_definitions(id) on delete cascade,
    value           text,
    encrypted_value text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint project_field_values_project_field_uq unique (project_id, field_def_id)
);

create index if not exists project_field_values_team_project_idx
    on public.project_field_values (team_id, project_id);

-- ──────────────────────────────────────────────
-- 3. 변경 이력 (diff 추적)
-- ──────────────────────────────────────────────
create table if not exists public.project_field_history (
    id          bigint generated always as identity primary key,
    team_id     text not null,
    project_id  bigint not null,
    field_def_id bigint not null,
    revision    int not null default 1,
    old_value   text,
    new_value   text,
    is_secret   boolean not null default false,
    action      text not null check (action in ('create', 'update', 'delete')),
    changed_by  text not null,
    changed_at  timestamptz not null default now()
);

create index if not exists project_field_history_project_idx
    on public.project_field_history (project_id, changed_at desc);

create index if not exists project_field_history_team_idx
    on public.project_field_history (team_id, changed_at desc);

-- ──────────────────────────────────────────────
-- 4. 민감 정보 열람 감사 로그
-- ──────────────────────────────────────────────
create table if not exists public.project_field_audit_logs (
    id          bigint generated always as identity primary key,
    team_id     text not null,
    project_id  bigint not null,
    field_def_id bigint not null,
    action      text not null check (action in ('view', 'update', 'delete')),
    actor_email text not null,
    created_at  timestamptz not null default now()
);

create index if not exists project_field_audit_logs_team_idx
    on public.project_field_audit_logs (team_id, created_at desc);

-- ──────────────────────────────────────────────
-- 5. RLS 정책
-- ──────────────────────────────────────────────

-- 5-1. field_definitions
alter table public.project_field_definitions enable row level security;
alter table public.project_field_definitions force row level security;

create policy "pfd_select_team_member"
    on public.project_field_definitions for select to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

create policy "pfd_insert_team_member"
    on public.project_field_definitions for insert to authenticated
    with check (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

create policy "pfd_update_team_member"
    on public.project_field_definitions for update to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

create policy "pfd_delete_team_member"
    on public.project_field_definitions for delete to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

-- 5-2. field_values — 읽기는 팀원, 쓰기는 service_role (API Route 경유)
alter table public.project_field_values enable row level security;
alter table public.project_field_values force row level security;

create policy "pfv_select_team_member"
    on public.project_field_values for select to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

-- field_values 쓰기는 service_role 전용 (암호화가 서버에서 처리되어야 하므로)

-- 5-3. field_history — 읽기만 허용
alter table public.project_field_history enable row level security;
alter table public.project_field_history force row level security;

create policy "pfh_select_team_member"
    on public.project_field_history for select to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

-- 5-4. audit_logs — 읽기만 허용
alter table public.project_field_audit_logs enable row level security;
alter table public.project_field_audit_logs force row level security;

create policy "pfal_select_team_member"
    on public.project_field_audit_logs for select to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid() and tm.status = 'active'
        )
    );

-- ──────────────────────────────────────────────
-- 6. 권한 부여
-- ──────────────────────────────────────────────
grant select, insert, update, delete on public.project_field_definitions to authenticated;
grant all on public.project_field_definitions to service_role;

grant select on public.project_field_values to authenticated;
grant all on public.project_field_values to service_role;

grant select on public.project_field_history to authenticated;
grant all on public.project_field_history to service_role;

grant select on public.project_field_audit_logs to authenticated;
grant all on public.project_field_audit_logs to service_role;
