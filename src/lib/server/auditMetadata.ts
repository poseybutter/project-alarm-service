import "server-only";

function maskIpAddress(value: string | null) {
    if (!value) return null;
    const ip = value.trim();
    const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
    if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;

    if (ip.includes(":")) {
        const prefix = ip.split(":").filter(Boolean).slice(0, 4).join(":");
        return prefix ? `${prefix}::/64` : "ipv6";
    }
    return "unknown";
}

function browserFamily(value: string | null) {
    if (!value) return null;
    if (/bot|crawler|spider/i.test(value)) return "bot";
    if (/edg\//i.test(value)) return "edge";
    if (/firefox\//i.test(value)) return "firefox";
    if (/chrome\//i.test(value)) return "chrome";
    if (/safari\//i.test(value)) return "safari";
    return "other";
}

export function minimizedAuditMetadata(request: Request) {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
    const address = forwardedFor?.trim() || request.headers.get("x-real-ip");
    return {
        ip: maskIpAddress(address),
        userAgent: browserFamily(request.headers.get("user-agent")),
    };
}

