-- V60: 프로젝트 삭제 시 FK 위반 수정
--
-- tasks, quests, accessibility 테이블에 project_id → projects(id) FK가
-- ON DELETE SET NULL 없이 (NO ACTION) 생성된 경우가 있다.
-- V34가 이미 FK가 존재하면 건너뛰기 때문에, 잘못된 FK가 선점하면
-- 올바른 FK가 생성되지 않는다.
--
-- 이 마이그레이션은 project_id FK를 모두 찾아 ON DELETE SET NULL이
-- 아닌 경우 DROP + 재생성한다.

do $$
declare
    tbl text;
    fk_name text;
    del_action text;
begin
    foreach tbl in array array['tasks', 'quests', 'accessibility'] loop
        -- project_id 컬럼을 참조하는 모든 FK를 검사
        for fk_name, del_action in
            select c.conname, c.confdeltype
            from pg_constraint c
            join pg_attribute a
              on a.attrelid = c.conrelid
             and a.attnum = any(c.conkey)
            where c.conrelid = format('public.%I', tbl)::regclass
              and c.confrelid = 'public.projects'::regclass
              and c.contype = 'f'
              and a.attname = 'project_id'
        loop
            -- confdeltype: 'a' = NO ACTION, 'r' = RESTRICT, 'n' = SET NULL, 'c' = CASCADE
            if del_action not in ('n') then
                raise notice 'Dropping FK % on % (delete_action=%)', fk_name, tbl, del_action;
                execute format('alter table public.%I drop constraint %I', tbl, fk_name);
            end if;
        end loop;

        -- ON DELETE SET NULL FK가 없으면 생성
        if not exists (
            select 1
            from pg_constraint c
            join pg_attribute a
              on a.attrelid = c.conrelid
             and a.attnum = any(c.conkey)
            where c.conrelid = format('public.%I', tbl)::regclass
              and c.confrelid = 'public.projects'::regclass
              and c.contype = 'f'
              and a.attname = 'project_id'
              and c.confdeltype = 'n'
        ) then
            raise notice 'Creating FK %_project_id_fkey on % with ON DELETE SET NULL', tbl, tbl;
            execute format(
                'alter table public.%I add constraint %I foreign key (project_id) references public.projects(id) on update cascade on delete set null',
                tbl,
                tbl || '_project_id_fkey'
            );
        end if;
    end loop;
end;
$$;
