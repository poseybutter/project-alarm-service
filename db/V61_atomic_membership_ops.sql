-- V61: 멤버십 추가/제거를 원자적으로 처리하는 RPC 함수
-- addTeamMembership: players INSERT + team_memberships role 보정을 단일 트랜잭션으로
-- removeTeamMembership: team_memberships DELETE + players DELETE를 단일 트랜잭션으로

-- ────────────────────────────────────────────────────────────
-- 1. admin_add_team_membership
-- ────────────────────────────────────────────────────────────

create or replace function public.admin_add_team_membership(
    p_team_id       text,
    p_email         text,
    p_display_name  text,
    p_role          text,       -- 'admin' | 'member' | 'viewer'
    p_avatar_url    text default null,
    p_bio           text default null,
    p_job_role      text default null,
    p_actor_email   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player_role   text;
    v_role_key      text;
    v_role_id       uuid;
    v_player_id     bigint;
    v_membership_id uuid;
    v_membership    jsonb;
begin
    -- 입력 검증
    if p_role not in ('admin', 'member', 'viewer') then
        raise exception '유효하지 않은 역할입니다: %', p_role using errcode = '22023';
    end if;

    -- players 테이블은 admin/member만 지원 — viewer는 member로 매핑
    v_player_role := case when p_role = 'admin' then 'admin' else 'member' end;

    -- 시스템 역할 ID 조회
    v_role_key := case
        when p_role = 'admin'  then 'team_admin'
        when p_role = 'viewer' then 'team_viewer'
        else 'team_member'
    end;

    select id into v_role_id
    from public.roles
    where team_id is null
      and role_key = v_role_key
      and status = 'active'
    limit 1;

    -- players row 생성 (V31 트리거가 team_memberships를 자동 생성)
    insert into public.players (team_id, name, email, role, status, avatar_url, bio, job_role)
    values (p_team_id, p_display_name, p_email, v_player_role, 'active', p_avatar_url, p_bio, p_job_role)
    returning id into v_player_id;

    -- 트리거가 생성한 membership의 role/role_id를 즉시 보정
    -- 동일 트랜잭션이므로 중간 상태가 외부에 노출되지 않음
    update public.team_memberships
    set role = p_role,
        role_id = coalesce(v_role_id, role_id),
        is_default = false
    where legacy_player_id = v_player_id
    returning id into v_membership_id;

    if v_membership_id is null then
        raise exception '트리거가 멤버십을 생성하지 못했습니다.' using errcode = 'P0002';
    end if;

    -- 결과 조회
    select jsonb_build_object(
        'id', tm.id,
        'team_id', tm.team_id,
        'role', tm.role,
        'status', tm.status,
        'is_default', tm.is_default,
        'legacy_player_id', tm.legacy_player_id
    ) into v_membership
    from public.team_memberships tm
    where tm.id = v_membership_id;

    -- 감사 로그
    if p_actor_email is not null then
        insert into public.admin_audit_logs (team_id, actor_email, action, target_type, target_id, target_label, after_state)
        values (p_team_id, p_actor_email, 'membership.added', 'team_membership', v_membership_id::text, p_display_name, v_membership);
    end if;

    return v_membership;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 2. admin_remove_team_membership
-- ────────────────────────────────────────────────────────────

create or replace function public.admin_remove_team_membership(
    p_membership_id uuid,
    p_team_id       text,
    p_actor_email   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_membership    record;
    v_profile       record;
    v_admin_count   int;
    v_deleted_count int;
    v_before_state  jsonb;
begin
    -- 멤버십 조회 (FOR UPDATE 잠금)
    select tm.id, tm.team_id, tm.role, tm.status, tm.is_default, tm.legacy_player_id,
           pr.email as profile_email, pr.display_name as profile_display_name
    into v_membership
    from public.team_memberships tm
    join public.profiles pr on pr.id = tm.profile_id
    where tm.id = p_membership_id
    for update of tm;

    if not found or v_membership.team_id <> p_team_id then
        raise exception '멤버십을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    if v_membership.is_default then
        raise exception '기본 소속은 이 기능으로 제거할 수 없습니다.' using errcode = '22023';
    end if;

    -- 마지막 관리자 보호
    if v_membership.role = 'admin' then
        select count(*) into v_admin_count
        from public.team_memberships
        where team_id = p_team_id
          and role = 'admin'
          and status = 'active';

        if v_admin_count <= 1 then
            raise exception '팀의 마지막 관리자는 제거할 수 없습니다.' using errcode = '22023';
        end if;
    end if;

    v_before_state := jsonb_build_object(
        'id', v_membership.id,
        'team_id', v_membership.team_id,
        'role', v_membership.role,
        'status', v_membership.status,
        'is_default', v_membership.is_default,
        'legacy_player_id', v_membership.legacy_player_id
    );

    -- team_memberships 삭제
    delete from public.team_memberships
    where id = p_membership_id
      and team_id = p_team_id
      and is_default = false;

    get diagnostics v_deleted_count = row_count;
    if v_deleted_count = 0 then
        raise exception '멤버십을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    -- players row 삭제 (있는 경우) — 실패 시 트랜잭션 전체 롤백
    if v_membership.legacy_player_id is not null then
        delete from public.players
        where id = v_membership.legacy_player_id
          and team_id = p_team_id;
    end if;

    -- 감사 로그
    if p_actor_email is not null then
        insert into public.admin_audit_logs (team_id, actor_email, action, target_type, target_id, target_label, before_state)
        values (p_team_id, p_actor_email, 'membership.removed', 'team_membership',
                p_membership_id::text,
                coalesce(v_membership.profile_display_name, v_membership.profile_email),
                v_before_state);
    end if;

    return v_before_state;
end;
$$;
