-- 주간 브리핑 개편: 상태별 아코디언 에디터(Tiptap HTML) 저장용 컬럼.
-- 진행중→in_progress, 대기→waiting, 시작 전→not_started, 지연/보류→delayed, 완료→done
-- 기존 project/maintenance/etc/notice/checklist/okr 컬럼은 그대로 둔다.
alter table public.briefings
  add column if not exists in_progress text,
  add column if not exists waiting     text,
  add column if not exists not_started text,
  add column if not exists delayed     text,
  add column if not exists done         text;
