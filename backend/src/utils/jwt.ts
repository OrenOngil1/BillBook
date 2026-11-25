import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";
import { randomUUID } from "node:crypto";
import type { Role } from "../generated/prisma/enums.js";

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export function createAccessToken(userId: number, role: Role) {
    return new SignJWT({ role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(userId))
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(ACCESS_SECRET);
}

export function createRefreshToken() {
    return randomUUID();
}

export async function verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, ACCESS_SECRET, {
        algorithms: ["HS256"],
        requiredClaims: ["sub", "jti", "iat", "exp"]
    });

    return { id: Number(payload.sub), role: payload.role as Role }
}
