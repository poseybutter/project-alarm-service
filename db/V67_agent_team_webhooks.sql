-- V67: 팀별 팀 대화방(Google Chat) 웹훅 저장소
--
-- 지금까지 team_room 발송은 전역 env GOOGLE_CHAT_WEBHOOK 하나뿐이라,
-- 레거시 단일 팀(ud2)만 팀 대화방 알림(레벨업·팀 브리핑 발송)을 받을 수 있었다.
-- 팀마다 웹훅을 저장해 각 팀 대화방으로 보낸다. 행이 없는 레거시 팀은 앱이 env 로 폴백한다.
--
-- webhook_url 은 앱이 암호화(encryptIntegrationToken)해 저장한다.
-- agent_member_webhooks 와 같이 서버 전용 테이블 — 클라이언트 접근 없음(V38 과 동일한 자세).

create table if not exists public.agent_team_webhooks (
    team_id text primary key,
    webhook_url text not null,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.agent_team_webhooks is
    '팀 대화방 Google Chat 웹훅(암호화 저장). 서버 라우트 전용 — service_role 만 접근.';

alter table public.agent_team_webhooks enable row level security;
alter table public.agent_team_webhooks force row level security;
revoke all on table public.agent_team_webhooks from anon, authenticated;
grant all on table public.agent_team_webhooks to service_role;
