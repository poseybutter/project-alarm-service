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
        -- 구조 검증: 배열이어야 하고, 각 요소는 text 키를 가진 객체여야 한다
        IF jsonb_typeof(NEW.content_items) != 'array'
           OR jsonb_array_length(NEW.content_items) = 0 THEN
            RAISE EXCEPTION 'content_items must be a non-empty JSON array';
        END IF;

        -- content 동기화: 모든 text를 줄바꿈으로 연결
        NEW.content := (
            SELECT string_agg(elem->>'text', E'\n')
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

CREATE TRIGGER tasks_sync_content_items_trigger
    BEFORE INSERT OR UPDATE OF content_items
    ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.tasks_sync_content_items();
