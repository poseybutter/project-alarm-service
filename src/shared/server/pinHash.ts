import { scrypt, randomBytes, timingSafeEqual } from "crypto";

// PIN은 4~6자리 숫자 — 키 길이 32바이트, cost N=16384.
// rate limit은 온라인 브루트포스만 차단. DB 유출 시 오프라인 공격 방어를 위해
// scrypt cost는 기본값(16384) 유지.
const KEY_LEN = 32;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

function scryptAsync(
    password: string,
    salt: string,
    keylen: number,
    options: { N: number; r: number; p: number },
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, keylen, options, (err, derived) => {
            if (err) reject(err);
            else resolve(derived);
        });
    });
}

export async function hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = await scryptAsync(pin, salt, KEY_LEN, SCRYPT_OPTIONS);
    return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
    try {
        const [salt, hash] = stored.split(":");
        if (!salt || !hash) return false;
        const derived = await scryptAsync(pin, salt, KEY_LEN, SCRYPT_OPTIONS);
        const expected = Buffer.from(hash, "hex");
        if (derived.length !== expected.length) return false;
        return timingSafeEqual(derived, expected);
    } catch {
        // 해시 형식 불일치(이전 SHA-256 해시 등) 시 검증 실패로 처리
        return false;
    }
}
