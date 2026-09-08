import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// PIN은 4~6자리 숫자 — 키 길이 32바이트, cost N=16384.
// rate limit은 온라인 브루트포스만 차단. DB 유출 시 오프라인 공격 방어를 위해
// scrypt cost는 기본값(16384) 유지.
const KEY_LEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export function hashPin(pin: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(pin, salt, KEY_LEN, SCRYPT_OPTIONS).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
    try {
        const [salt, hash] = stored.split(":");
        if (!salt || !hash) return false;
        const derived = scryptSync(pin, salt, KEY_LEN, SCRYPT_OPTIONS);
        const expected = Buffer.from(hash, "hex");
        if (derived.length !== expected.length) return false;
        return timingSafeEqual(derived, expected);
    } catch {
        // 해시 형식 불일치(이전 SHA-256 해시 등) 시 검증 실패로 처리
        return false;
    }
}
