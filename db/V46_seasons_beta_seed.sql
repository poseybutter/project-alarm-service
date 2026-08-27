-- V46: 베타 시즌 시드 (V41에서 분리)
-- V41의 uq_seasons_one_active_per_team partial unique index 생성 이후에
-- 충돌 대상을 명시해야 on conflict가 정상 동작하므로 별도 마이그레이션으로 분리.
-- V41을 이미 실행한 환경에서도 이 시드가 누락 없이 적용된다.

insert into public.seasons (team_id, label, sub_label, range_start, range_end, status)
select
    t.id,
    '베타 시즌',
    '왕좌는 하나다',
    '2026-05-01',
    '2026-08-31',
    'active'
from public.teams t
on conflict (team_id) where (status = 'active') do nothing;
