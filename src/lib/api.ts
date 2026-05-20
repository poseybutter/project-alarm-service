/**
 * Spring Boot 백엔드 호출 유틸.
 *
 * - server-side (Route Handler, RSC): API_URL 사용 (예: http://api:8080 등 내부 URL).
 * - client-side: NEXT_PUBLIC_API_URL fallback. 단, 인증·쿠키 흐름은 가능한 한 Next.js
 *   Route Handler 를 거쳐서 호출(same-origin + httpOnly 쿠키)하는 것을 권장.
 */

const baseURL =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080";

export class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

/** 공통 fetch 래퍼. credentials:'include' + JSON Content-Type 기본값 적용. */
export async function apiFetch<T = unknown>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const url = path.startsWith("http")
        ? path
        : `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && options.body) {
        headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
    }

    const res = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials ?? "include",
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!res.ok) {
        let message = `API ${res.status} ${res.statusText}`;
        if (
            parsed &&
            typeof parsed === "object" &&
            "message" in parsed &&
            typeof (parsed as { message?: unknown }).message === "string"
        ) {
            message = (parsed as { message: string }).message;
        }
        throw new ApiError(res.status, message, parsed);
    }

    return parsed as T;
}

export type LoginResponse = {
    accessToken: string;
    refreshToken?: string;
    user?: {
        id: number | string;
        email: string;
        name: string;
        role?: string;
    };
};

export type SignupResponse = {
    id?: number | string;
    email?: string;
    name?: string;
    status?: string;
};

export type RefreshResponse = {
    accessToken: string;
    refreshToken?: string;
};

export async function login(email: string, password: string) {
    return apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
}

export async function signup(
    email: string,
    password: string,
    name: string,
    invitationCode: string,
) {
    return apiFetch<SignupResponse>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, name, invitationCode }),
    });
}

export async function logout() {
    return apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function refreshToken(token: string) {
    return apiFetch<RefreshResponse>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: token }),
    });
}
