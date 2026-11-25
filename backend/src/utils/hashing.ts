import argon2 from 'argon2';
import { createHash } from "node:crypto";

export function hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hashedPassword: string, candidatePassword: string) {
    return argon2.verify(hashedPassword, candidatePassword);
}

export function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");;
}
