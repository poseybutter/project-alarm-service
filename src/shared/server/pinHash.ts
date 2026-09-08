import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// PIN은 4~6자리 숫자 — 키 길이 32바이트, cost N=8192로 충분.
// rate limit(5회/5분)이 브루트포스를 차단하므로 과도한 cost 불필요.
const KEY_LEN = 32;
const SCRYPT_OPTIONS = { N: 8192, r: 8, p: 1 };

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
