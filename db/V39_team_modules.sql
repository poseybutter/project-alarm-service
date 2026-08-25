-- V39: 팀별 기능 모듈 활성화 설정
-- 팀 생성·수정 시 필요한 모듈만 선택적으로 활성화할 수 있도록 한다.
-- 기존 팀은 모든 모듈을 활성화된 상태로 초기화한다.

create table if not exists public.team_modules (
    team_id text not null references public.teams(id) on delete cascade,
    module  text not null check (module in (
                'tasks', 'report', 'gamification', 'agent', 'manage'
            )),
    enabled boolean not null default true,
    primary key (team_id, module)
);

-- 기존 팀 전체에 모든 모듈 활성화로 초기화
insert into public.team_modules (team_id, module, enabled)
select
    t.id,
    m.module,
    true
from public.teams t
cross join (
    values ('tasks'), ('report'), ('gamification'), ('agent'), ('manage')
) as m(module)
on conflict (team_id, module) do nothing;

-- RLS
alter table public.team_modules enable row level security;
alter table public.team_modules force row level security;

-- 소속 팀 구성원은 자기 팀 모듈 목록을 읽을 수 있다
create policy "team_modules_select"
    on public.team_modules
    for select
    to authenticated
    using (
        team_id in (
            select tm.team_id
            from public.team_memberships tm
            join public.profiles p on p.id = tm.profile_id
            where p.auth_user_id = auth.uid()
              and tm.status = 'active'
        )
    );

-- 쓰기는 service_role 전용 (관리자 API에서 처리)
grant select on public.team_modules to authenticated;
grant all on public.team_modules to service_role;
