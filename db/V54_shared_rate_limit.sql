-- V54: 배포 전체에서 공유되는 레이트리밋 카운터 (PR #49 Qodo 리뷰 반영)
--
-- 인메모리 카운터는 서버리스 인스턴스마다 따로 세서 콜드스타트/수평 확장 시
-- 설정 한도를 넘길 수 있다. 원자적 upsert 한 번으로 판정하는 공유 카운터를 둔다.
-- 앱은 로컬 카운터를 1차로 쓰고(값싼 방어), 이 RPC 로 전역 한도를 확정한다.
-- RPC 실패 시 앱은 가용성 우선으로 통과시킨다(fail-open).

create table if not exists public.rate_limit_counters (
    key text primary key,
    count integer not null,
    reset_at timestamptz not null
);

-- service_role 전용. 정책 없이 RLS 만 켜서 anon/authenticated 접근을 차단한다.
alter table public.rate_limit_counters enable row level security;
revoke all on table public.rate_limit_counters from anon, authenticated;
grant all on table public.rate_limit_counters to service_role;

create or replace function public.consume_rate_limit(
    p_key text,
    p_limit integer,
    p_window_ms integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    now_ts timestamptz := now();
    row_record public.rate_limit_counters;
begin
    -- INSERT ... ON CONFLICT 하나로 증가·윈도 갱신을 원자적으로 처리한다.
    insert into public.rate_limit_counters as c (key, count, reset_at)
    values (p_key, 1, now_ts + make_interval(secs => p_window_ms / 1000.0))
    on conflict (key) do update
        set count = case
                when c.reset_at <= now_ts then 1
                else c.count + 1
            end,
            reset_at = case
                when c.reset_at <= now_ts
                    then now_ts + make_interval(secs => p_window_ms / 1000.0)
                else c.reset_at
            end
    returning * into row_record;

    if row_record.count > p_limit then
        return query select
            false,
            greatest(
                1,
                ceil(extract(epoch from (row_record.reset_at - now_ts)))::integer
            );
    else
        return query select true, 0;
    end if;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- 만료 키 정리 (매일 KST 03:30). 같은 이름의 잡은 갱신되므로 재실행 안전.
do $$
begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
        create extension if not exists pg_cron;
        perform cron.schedule(
            'purge-rate-limit-counters',
            '30 18 * * *',
            'delete from public.rate_limit_counters where reset_at < now() - interval ''1 day'''
        );
    else
        raise notice 'pg_cron 을 사용할 수 없습니다. rate_limit_counters 만료 행을 외부에서 정리하세요.';
    end if;
end $$;
