/**
 * 내부 API(/api/*) 호출 공용 클라이언트 — 에러 정규화·JSON 파싱 일원화.
 * 원시 fetch 산재 제거용 (CONTRIBUTING 점진 이행 대상). 신규 코드는 이 모듈을 경유한다.
 */

export class ApiError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(status: number, message: string, body: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

type ApiFetchInit = Omit<RequestInit, "body"> & { body?: unknown };

/** 실패 시 ApiError throw, 성공 시 JSON 을 T 로 반환 (204 등 빈 응답은 null) */
export async function apiFetch<T>(
    path: string,
    init: ApiFetchInit = {},
): Promise<T> {
    const { body, headers, ...rest } = init;
    // Headers 인스턴스·배열 형식 유실 방지 — 생성자로 정규화
    const mergedHeaders = new Headers(headers);
    if (body !== undefined && !mergedHeaders.has("Content-Type")) {
        mergedHeaders.set("Content-Type", "application/json");
    }
    const res = await fetch(path, {
        ...rest,
        headers: mergedHeaders,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let json: unknown = null;
    if (text) {
        try {
            json = JSON.parse(text);
        } catch {
            // JSON 아닌 응답 — body 는 원문 유지
            json = text;
        }
    }

    if (!res.ok) {
        throw new ApiError(
            res.status,
            extractMessage(json) ?? `요청 실패 (${res.status})`,
            json,
        );
    }

    return json as T;
}

/** 서버 에러 응답의 message 필드 추출 (없으면 null) */
function extractMessage(json: unknown): string | null {
    if (json && typeof json === "object" && "message" in json) {
        const message = (json as { message?: unknown }).message;
        if (typeof message === "string") return message;
    }
    return null;
}
