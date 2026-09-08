-- V57: 팀 레벨 세팅 PIN (프로젝트별이 아닌 팀 전체 공통)
-- 관리자가 설정하면 모든 프로젝트의 세팅 정보 열람 시 PIN 필요

alter table public.teams
    add column if not exists settings_pin_hash text;

-- V56에서 추가한 projects.settings_pin_hash는 사용하지 않음 (삭제 선택)
alter table public.projects
    drop column if exists settings_pin_hash;
