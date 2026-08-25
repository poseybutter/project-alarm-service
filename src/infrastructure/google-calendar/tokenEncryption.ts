import "server-only";

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1";

function encryptionKey() {
    const configured = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
    if (!configured) return null;
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) {
        throw new Error(
            "INTEGRATION_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
        );
    }
    return key;
}

export function encryptIntegrationToken(value: string | null | undefined) {
    if (!value || value.startsWith(`${PREFIX}:`)) return value ?? null;
    const key = encryptionKey();
    if (!key) return value;

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
        PREFIX,
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
    ].join(":");
}

export function decryptIntegrationToken(value: string | null | undefined) {
    if (!value) return null;
    if (!value.startsWith(`${PREFIX}:`)) return value;

    const key = encryptionKey();
    if (!key) {
        throw new Error("Integration token encryption key is not configured");
    }
    const [, , ivValue, tagValue, ciphertextValue] = value.split(":");
    if (!ivValue || !tagValue || !ciphertextValue) {
        throw new Error("Encrypted integration token is malformed");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, "base64url")),
        decipher.final(),
    ]).toString("utf8");
}
