import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

type EncryptedPayload = { iv: string; tag: string; ct: string };

function getKey(): Buffer {
    const hex = process.env.FIELD_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error(
            "FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)",
        );
    }
    return Buffer.from(hex, "hex");
}

export function encryptField(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload: EncryptedPayload = {
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        ct: encrypted.toString("hex"),
    };
    return JSON.stringify(payload);
}

export function decryptField(ciphertext: string): string {
    const key = getKey();
    const { iv, tag, ct } = JSON.parse(ciphertext) as EncryptedPayload;
    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return (
        decipher.update(ct, "hex", "utf8") + decipher.final("utf8")
    );
}
