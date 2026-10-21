-- V65: 아침 브리핑 중복 발송 방지 (claim-first)
--
-- morning 라우트는 "이력 확인 → 발송 → 이력 기록" 순서라, 크론이 겹쳐 돌면
-- 두 실행이 모두 확인을 통과해 같은 멤버에게 브리핑을 두 번 보낼 수 있었다.
-- 앱은 이제 발송 전에 이력 행을 먼저 insert 해 선점하고, 이 고유 인덱스 충돌(23505)을
-- "이미 발송/발송 중"으로 처리한다.
--
-- 범위: dedupe_key 가 'morning-briefing:' 로 시작하는 행만.
-- 수동 발송(notifications/send)은 같은 dedupe_key 를 쿨다운(24h) 이후 다시 기록하므로
-- 전체 (team_id, dedupe_key) 고유 제약을 걸면 정상 재발송이 막힌다.
-- 아침 브리핑 키는 'morning-briefing:<email>:<YYYY-MM-DD>' 형태라 하루 한 행이 맞다.

-- 1) 기존 중복 행 정리: 같은 (team_id, dedupe_key) 중 가장 먼저 기록된 행만 남긴다.
delete from public.agent_notification_deliveries d
using public.agent_notification_deliveries keep
where d.dedupe_key like 'morning-briefing:%'
  and keep.team_id = d.team_id
  and keep.dedupe_key = d.dedupe_key
  and keep.id < d.id;

-- 2) 아침 브리핑 발송 선점용 부분 고유 인덱스
create unique index if not exists agent_notification_deliveries_morning_dedupe_uniq
    on public.agent_notification_deliveries (team_id, dedupe_key)
    where dedupe_key like 'morning-briefing:%';
