-- V55: 변경 이력에 field_label 저장 (고정 필드 이력 지원)
-- field_def_id = 0인 경우 field_label로 필드명을 식별한다.

alter table public.project_field_history
    add column if not exists field_label text;
