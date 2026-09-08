-- V54: 프로젝트별 필드 순서 저장 (기존 고정 필드 + 커스텀 필드 통합 정렬)
-- field_order에 ["pm","developer","cf_12","designer","note"] 형태의 JSON 배열 저장

alter table public.projects
    add column if not exists field_order jsonb;
