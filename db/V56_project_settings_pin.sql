-- V56: 프로젝트 세팅 정보 PIN 보호
-- 프로젝트별 4~6자리 PIN을 설정하여 세팅 정보 열람을 제한한다.

alter table public.projects
    add column if not exists settings_pin_hash text;
