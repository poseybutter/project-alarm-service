-- V62: TOTP 인증 + 팀원 자격증명 관리
-- PIN 인증을 Google TOTP(개인별)로 교체하고, 팀원별 Windows 계정 등 자격증명을 관리한다.

-- ─── 1. totp_secrets: 팀원별 TOTP 시크릿 ─────────────────────────────

create table if not exists public.totp_secrets (
    id              bigint generated always as identity primary key,
    profile_id      uuid not null references public.profiles(id) on delete cascade,
    team_id         text not null references public.teams(id) on delete cascade,
    encrypted_secret text not null,
    verified_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint totp_secrets_profile_team_uq unique (profile_id, team_id)
);

comment on table  public.totp_secrets is '팀원별 Google TOTP 시크릿 (AES-256-GCM 암호화)';
comment on column public.totp_secrets.encrypted_secret is 'fieldEncryption으로 암호화된 base32 시크릿';
comment on column public.totp_secrets.verified_at is 'null이면 셋업 미완료 (QR 스캔 전)';

-- ─── 2. member_credentials: 팀원별 자격증명 ──────────────────────────

create table if not exists public.member_credentials (
    id              bigint generated always as identity primary key,
    team_id         text not null references public.teams(id) on delete cascade,
    profile_id      uuid not null references public.profiles(id) on delete cascade,
    label           text not null,
    encrypted_pw    text,
    notes           text,
    sort_order      int not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table  public.member_credentials is '팀원별 자격증명 (Windows 계정, VPN 등)';
comment on column public.member_credentials.encrypted_pw is 'fieldEncryption으로 암호화된 비밀번호';

create index if not exists member_credentials_team_profile_idx
    on public.member_credentials (team_id, profile_id, sort_order);

-- ─── 3. member_credential_audit_logs: 자격증명 감사 로그 ─────────────

create table if not exists public.member_credential_audit_logs (
    id              bigint generated always as identity primary key,
    team_id         text not null,
    credential_id   bigint not null,
    action          text not null check (action in ('view', 'create', 'update', 'delete')),
    actor_email     text not null,
    created_at      timestamptz not null default now()
);

create index if not exists mcal_team_created_idx
    on public.member_credential_audit_logs (team_id, created_at desc);

comment on table public.member_credential_audit_logs is '팀원 자격증명 접근/변경 감사 로그';

-- ─── 4. teams 테이블 확장: TOTP 필수 여부 ────────────────────────────

alter table public.teams
    add column if not exists totp_required boolean not null default false;

-- ─── 5. RLS: 모든 새 테이블은 service_role 전용 (V36 패턴) ──────────

-- totp_secrets
alter table public.totp_secrets enable row level security;
alter table public.totp_secrets force row level security;
revoke all on table public.totp_secrets from anon, authenticated;
grant all on table public.totp_secrets to service_role;

-- member_credentials
alter table public.member_credentials enable row level security;
alter table public.member_credentials force row level security;
revoke all on table public.member_credentials from anon, authenticated;
grant all on table public.member_credentials to service_role;

-- member_credential_audit_logs
alter table public.member_credential_audit_logs enable row level security;
alter table public.member_credential_audit_logs force row level security;
revoke all on table public.member_credential_audit_logs from anon, authenticated;
grant all on table public.member_credential_audit_logs to service_role;

-- sequence 권한 (identity 컬럼용)
grant usage, select on all sequences in schema public to service_role;
