-- V53: 커스텀 필드를 팀 공통이 아닌 프로젝트별 독립으로 변경
--
-- field_definitions에 project_id를 추가하여 각 프로젝트가 자체 필드 구성을 갖는다.
-- 기존 unique 제약(team_id, name)을 (project_id, name)으로 변경한다.

-- 1. project_id 컬럼 추가
alter table public.project_field_definitions
    add column if not exists project_id bigint references public.projects(id) on delete cascade;

-- 2. 기존 team-level unique 제약 제거, project-level unique 제약 추가
alter table public.project_field_definitions
    drop constraint if exists project_field_definitions_team_name_uq;

alter table public.project_field_definitions
    add constraint project_field_definitions_project_name_uq unique (project_id, name);

-- 3. project_id 인덱스
create index if not exists project_field_definitions_project_idx
    on public.project_field_definitions (project_id, sort_order);
