-- V59: field_definitions 쓰기 정책에서 viewer 제외
--
-- 기존 INSERT/UPDATE/DELETE 정책은 active 팀원이면 누구나 허용했으나,
-- viewer 역할은 필드 정의를 수정할 수 없어야 한다.

drop policy if exists "pfd_insert_team_member" on public.project_field_definitions;
drop policy if exists "pfd_update_team_member" on public.project_field_definitions;
drop policy if exists "pfd_delete_team_member" on public.project_field_definitions;

create policy "pfd_insert_non_viewer"
    on public.project_field_definitions for insert to authenticated
    with check (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid()
              and tm.status = 'active'
              and tm.role != 'viewer'
        )
    );

create policy "pfd_update_non_viewer"
    on public.project_field_definitions for update to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid()
              and tm.status = 'active'
              and tm.role != 'viewer'
        )
    );

create policy "pfd_delete_non_viewer"
    on public.project_field_definitions for delete to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid()
              and tm.status = 'active'
              and tm.role != 'viewer'
        )
    );
