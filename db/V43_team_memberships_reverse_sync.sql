-- V43: team_memberships → players 역방향 동기화
--
-- 목적: players → team_memberships 는 이미 V31/V32 트리거로 동기화된다.
-- 반대 방향이 없어서, team_memberships를 직접 쓰는 새 코드는 players 를
-- 갱신하지 못해 두 테이블이 어긋난다. 이 트리거가 그 간극을 메운다.
--
-- 이걸로 "어느 테이블을 읽어도 값이 같다"가 보장되므로, 확장 계획의 읽기
-- 전환(players → team_memberships)을 파일 단위로 나눠서 안전하게 진행할 수
-- 있다.
--
-- 범위: default 멤버십(is_default = true)만 반영한다. players 는 팀 1개만
-- 표현할 수 있어서, 그 사람의 "현재 팀"에 해당하는 default 멤버십만 의미가
-- 있다. legacy_player_id 가 없는 멤버십(레거시 players 행과 연결 안 된
-- 신규 가입자)은 대상이 아니다.
--
-- 역할 매핑: viewer 는 players.role 에 'member' 로 기록한다 (레거시 화면과
-- RLS가 admin/member 두 값만 이해하기 때문 — docs/admin-architecture.md 참고).
-- 상태 매핑: team_memberships.status 는 active/suspended 뿐이다. pending/rejected
-- 는 players 쪽 access_requests 흐름에서만 관리되고, 그 상태의 players 행은
-- 애초에 default 멤버십이 없다 (V31 sync_legacy_player_identity 참고).
--
-- 순환 방지: players ↔ team_memberships 양쪽 트리거가 서로를 다시 건드릴 수
-- 있지만, 매 단계 "실제로 값이 바뀔 때만" UPDATE 하도록 WHERE 에 distinct
-- 조건을 걸어뒀다. 두 번째 왕복부터는 양쪽 다 이미 같은 값이라 UPDATE 대상이
-- 0행이 되어 트리거가 더 이상 이어지지 않는다.
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

    return new;
end;
$$;

revoke all on function public.sync_default_membership_to_legacy_player() from public;

drop trigger if exists team_memberships_sync_legacy_player on public.team_memberships;
create trigger team_memberships_sync_legacy_player
after insert or update of role, status, team_id, is_default, legacy_player_id
on public.team_memberships
for each row
when (new.is_default)
execute function public.sync_default_membership_to_legacy_player();
