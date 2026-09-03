-- V50: 업무 내용별 공수 입력 (content_items JSONB)
--
-- 기존 content(텍스트) + workload(분) 구조를 유지하면서,
-- 줄별 공수를 저장할 수 있는 content_items JSONB 컬럼을 추가한다.
-- content_items가 존재하면 트리거가 content와 workload를 자동 동기화한다.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS content_items jsonb DEFAULT NULL;

COMMENT ON COLUMN public.tasks.content_items IS
    'Structured content items with per-line workload. [{text: string, workload?: number}]. When non-NULL, content and workload are derived from this.';

-- content_items 검증 + content/workload 자동 동기화 트리거
CREATE OR REPLACE FUNCTION public.tasks_sync_content_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.content_items IS NOT NULL THEN
        -- 구조 검증: 비어 있지 않은 배열이어야 한다
        IF jsonb_typeof(NEW.content_items) != 'array'
           OR jsonb_array_length(NEW.content_items) = 0 THEN
            RAISE EXCEPTION 'content_items must be a non-empty JSON array';
        END IF;

        -- 요소 검증: 각 요소는 문자열 text 를 가진 객체여야 한다
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(NEW.content_items) elem
            WHERE jsonb_typeof(elem) != 'object'
               OR jsonb_typeof(elem->'text') != 'string'
        ) THEN
            RAISE EXCEPTION 'each content_items element must be an object with a string "text"';
        END IF;

        -- workload 검증: 있으면 0 이상의 정수여야 한다
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(NEW.content_items) elem
            WHERE elem ? 'workload'
              AND jsonb_typeof(elem->'workload') != 'null'
              AND (
                    jsonb_typeof(elem->'workload') != 'number'
                 OR (elem->>'workload') !~ '^\d+$'
              )
        ) THEN
            RAISE EXCEPTION 'content_items workload must be a non-negative integer';
        END IF;

        -- content 동기화: 모든 text를 줄바꿈으로 연결
        NEW.content := (
            SELECT COALESCE(string_agg(elem->>'text', E'\n'), '')
            FROM jsonb_array_elements(NEW.content_items) elem
        );
        -- workload 동기화: 모든 workload 합산
        NEW.workload := (
            SELECT COALESCE(SUM(COALESCE((elem->>'workload')::int, 0)), 0)
            FROM jsonb_array_elements(NEW.content_items) elem
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_content_items_trigger ON public.tasks;

-- content/workload 만 단독으로 UPDATE 하는 요청에서도 content_items 를 단일 출처로 유지한다
CREATE TRIGGER tasks_sync_content_items_trigger
    BEFORE INSERT OR UPDATE
    ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.tasks_sync_content_items();
