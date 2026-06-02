-- 주간 브리핑 개편: 업무(task)별 브리핑 카드 편집 내용 저장.
-- 한 주(briefings 행)의 각 task에 대해 편집된 Tiptap HTML(edited_content)을 보관.
-- briefing_id는 해당 주 briefings 행의 id, task_id는 tasks 행의 id.
create table if not exists public.briefing_tasks (
    id             bigint generated always as identity primary key,
    briefing_id    bigint not null references public.briefings (id) on delete cascade,
    task_id        bigint not null references public.tasks (id) on delete cascade,
    edited_content text,
    team_id        text   not null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (briefing_id, task_id)
);

create index if not exists briefing_tasks_briefing_idx
    on public.briefing_tasks (briefing_id);
create index if not exists briefing_tasks_team_idx
    on public.briefing_tasks (team_id);

-- RLS: 내부 팀 앱(브라우저 anon 클라이언트로 briefings를 직접 쓰는 기존 정책과 동일 기조)
alter table public.briefing_tasks enable row level security;

drop policy if exists "briefing_tasks all" on public.briefing_tasks;
create policy "briefing_tasks all"
    on public.briefing_tasks
    for all
    using (true)
    with check (true);

-- 실시간 구독이 필요하면 주석 해제
-- alter publication supabase_realtime add table public.briefing_tasks;
