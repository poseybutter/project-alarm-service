-- V29를 이미 적용한 환경에서 팀 삭제 시 감사 로그는 보존하고 팀 참조만 해제한다.
-- 실제 업무 데이터가 연결된 팀의 삭제 차단은 관리자 API에서 별도로 검증한다.

do $$
begin
    if to_regclass('public.admin_audit_logs') is not null then
        alter table public.admin_audit_logs
            drop constraint if exists admin_audit_logs_team_id_fkey;

        alter table public.admin_audit_logs
            add constraint admin_audit_logs_team_id_fkey
            foreign key (team_id)
            references public.teams(id)
            on update cascade
            on delete set null;
    end if;
end
$$;
