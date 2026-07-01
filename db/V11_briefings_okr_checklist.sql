-- 공지 탭: 확인해주세요(checklist) / OKR 섹션용 컬럼 추가.
-- e266c6a 커밋에서 코드에 먼저 추가됐으나 마이그레이션이 누락되어 뒤늦게 적용.
alter table public.briefings
  add column if not exists checklist text,
  add column if not exists okr       text;
