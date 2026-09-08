import { createHash } from "crypto";

const SALT = process.env.FIELD_ENCRYPTION_KEY?.slice(0, 16) ?? "default_pin_salt";

export function hashPin(pin: string): string {
    return createHash("sha256")
        .update(`${SALT}:${pin}`)
        .digest("hex");
}

export function verifyPin(pin: string, hash: string): boolean {
    return hashPin(pin) === hash;
}
