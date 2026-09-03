-- V51: 업무 내용 항목별 팀 캘린더 일정
--
-- V50에서 업무 내용을 content_items(항목별 공수/상태/일정)로 쪼갰다.
-- 항목에 자체 일정이 있으면 그 기간으로 별도 캘린더 일정을 만들고,
-- 일정이 없는 항목들은 기존처럼 업무 기간 일정 하나에 모아서 넣는다.
--
-- 업무 하나가 여러 일정을 갖게 되므로, 항목 일정의 Google 이벤트 ID 목록을 보관한다.
-- team_calendar_event_id(업무 기간 일정)는 기존 의미 그대로 유지한다.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS team_calendar_item_event_ids jsonb DEFAULT NULL;

COMMENT ON COLUMN public.tasks.team_calendar_item_event_ids IS
    'Google Calendar event ids for content_items that carry their own schedule, ordered by item order. NULL when the task has no per-item scheduled events.';
