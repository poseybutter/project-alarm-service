import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * 보안 응답 헤더.
 * - 모든 경로에 적용. 클릭재킹·MIME 스니핑·과도한 referrer 노출·미사용 브라우저 기능 차단.
 * - CSP(Content-Security-Policy)는 Next.js 인라인 스타일/스크립트와 충돌 위험이 커서
 *   별도 검증 후 도입 예정 (아래 주석 참고).
 */
const securityHeaders = [
    // MIME 타입 스니핑 차단
    { key: "X-Content-Type-Options", value: "nosniff" },
    // 클릭재킹 방지 — 외부 사이트에서 iframe 임베드 차단
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    // referrer 정보 최소 노출
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // 미사용 브라우저 기능 비활성화
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    // HTTPS 강제 (HTTP에서는 브라우저가 자동 무시 → 개발 환경 안전)
    {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
];

const nextConfig: NextConfig = {
    allowedDevOrigins: ["localhost:3000", "127.0.0.1:3000"],
    turbopack: {
        root: projectRoot,
    },
    async redirects() {
        return [
            {
                source: "/",
                destination: "/home",
                permanent: false,
            },
        ];
    },
    async headers() {
        if (process.env.NODE_ENV !== "production") {
            return [];
        }

        return [
            {
                source: "/:path*",
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
