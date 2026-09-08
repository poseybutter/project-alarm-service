-- V58: PIN 변경 시점 기록

alter table public.teams
    add column if not exists settings_pin_updated_at timestamptz;
