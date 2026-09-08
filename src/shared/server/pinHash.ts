import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export function hashPin(pin: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(pin, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = scryptSync(pin, salt, 64);
    return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}
