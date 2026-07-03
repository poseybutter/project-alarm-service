-- V25: accessibility status change audit fields
alter table public.accessibility
    add column if not exists previous_inspection_status text,
    add column if not exists status_updated_at timestamptz,
    add column if not exists status_updated_by text;

update public.accessibility
set
    status_updated_at = coalesce(status_updated_at, created_at, now()),
    status_updated_by = coalesce(status_updated_by, member)
where status_updated_at is null;
