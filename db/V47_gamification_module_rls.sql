-- V47: gamification 모듈 비활성 팀 접근 차단 (RLS 강화)
--
-- ModuleGuard 는 클라이언트 UI 레벨만 막으므로,
-- 직접 Supabase 클라이언트 호출로 gamification 데이터를 읽고 쓰는 것이 가능했다.
-- RESTRICTIVE 정책을 추가해 팀에서 gamification 모듈이 비활성이면
-- 인증된 사용자라도 quests / seasons / season_records / season_awards 에 접근할 수 없게 한다.
--
-- RESTRICTIVE 정책은 기존 permissive 정책과 AND 로 결합되므로
-- 기존 팀 구성원 체크 정책은 그대로 유지된다.
-- service_role 은 RLS 를 우회하므로 Cron / Admin API 는 영향 없음.

-- ── quests ──────────────────────────────────────────────────────────────────
drop policy if exists "quests_gamification_module_guard" on public.quests;
create policy "quests_gamification_module_guard"
    on public.quests
    as restrictive
    for all
    to authenticated
    using (
        exists (
            select 1 from public.team_modules
            where team_id = quests.team_id
              and module   = 'gamification'
              and enabled  = true
        )
    )
    with check (
        exists (
            select 1 from public.team_modules
            where team_id = quests.team_id
              and module   = 'gamification'
              and enabled  = true
        )
    );

-- ── seasons ──────────────────────────────────────────────────────────────────
drop policy if exists "seasons_gamification_module_guard" on public.seasons;
create policy "seasons_gamification_module_guard"
    on public.seasons
    as restrictive
    for select
    to authenticated
    using (
        exists (
            select 1 from public.team_modules
            where team_id = seasons.team_id
              and module   = 'gamification'
              and enabled  = true
        )
    );

-- ── season_records ───────────────────────────────────────────────────────────
drop policy if exists "season_records_gamification_module_guard" on public.season_records;
create policy "season_records_gamification_module_guard"
    on public.season_records
    as restrictive
    for select
    to authenticated
    using (
        exists (
            select 1 from public.team_modules
            where team_id = season_records.team_id
              and module   = 'gamification'
              and enabled  = true
        )
    );

-- ── season_awards ────────────────────────────────────────────────────────────
drop policy if exists "season_awards_gamification_module_guard" on public.season_awards;
create policy "season_awards_gamification_module_guard"
    on public.season_awards
    as restrictive
    for select
    to authenticated
    using (
        exists (
            select 1 from public.team_modules
            where team_id = season_awards.team_id
              and module   = 'gamification'
              and enabled  = true
        )
    );
