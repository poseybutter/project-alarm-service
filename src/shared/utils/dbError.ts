type DbErrorLike = { code?: string; message?: string; details?: string; hint?: string };

/**
 * Supabase(PostgREST) 오류를 사용자 문구로 바꾼다.
 * 고정 문구만 보여주면 RLS·FK·함수 누락을 구분할 수 없으므로 오류 코드를 함께 붙이고,
 * 원본 오류는 콘솔에 남겨 개발자 도구에서 원인을 확인할 수 있게 한다.
 */
export function describeDbError(context: string, error: unknown, fallback: string): string {
    console.error(`[${context}]`, error);
    const { code, message } = (error ?? {}) as DbErrorLike;
    let reason: string | null = null;
    switch (code) {
        case "42501":
            reason = "권한이 없어요";
            break;
        case "23503":
            reason = "담당자 또는 프로젝트가 현재 팀 정보와 맞지 않아요";
            break;
        case "23505":
            reason = "이미 같은 항목이 있어요";
            break;
        case "P0001":
            // 트리거·함수가 직접 올린 예외 — 메시지가 원인을 설명한다
            reason = message || null;
            break;
        case "PGRST202":
            reason = "서버 함수를 찾지 못했어요";
            break;
        default:
            // 분류하지 않은 오류(23502 NOT NULL, 23514 CHECK 등)는 DB 메시지로 원인을 보여준다
            reason = message ? message.slice(0, 200) : null;
    }
    if (!code) return fallback;
    return reason ? `${fallback}: ${reason} (${code})` : `${fallback} (${code})`;
}
