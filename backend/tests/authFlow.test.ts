import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";

// The real auth limiter allows 5 failed requests per window; this file sends more than that on purpose.
vi.mock("../src/middleware/rateLimiter.ts", () => {
    const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
    return { apiLimiter: passThrough, authLimiter: passThrough };
});

import { prisma } from "../src/db.js";
import { app } from "../src/app.js";
import { hashToken } from "../src/utils/hashing.js";
import { cleandb } from "../prisma/factories.js";
import { refreshCookieOf, withRefreshCookie } from "./auth.js";

const ROUTE = "/api/auth";
const PASSWORD = "correct horse battery";

beforeEach(async () => {
    await cleandb();
});

afterAll(async () => {
    await cleandb();
    await prisma.$disconnect();
});

function emailOf(username: string) {
    return `${username}@example.com`;
}

function register(username: string) {
    return request(app)
        .post(`${ROUTE}/register`)
        .send({ email: emailOf(username), username, password: PASSWORD });
}

function login(username: string, password = PASSWORD) {
    return request(app).post(`${ROUTE}/login`).send({ email: emailOf(username), password });
}

function refresh(cookie: string) {
    return request(app).post(`${ROUTE}/refresh`).set(withRefreshCookie(cookie));
}

function logout(cookie: string) {
    return request(app).post(`${ROUTE}/logout`).set(withRefreshCookie(cookie));
}

describe("session lifecycle", () => {
    it("rotates the refresh token on every refresh and ends the session on logout", async () => {
        const registered = await register("alice").expect(201);
        const first = refreshCookieOf(registered)!;

        const refreshed = await refresh(first).expect(200);
        const second = refreshCookieOf(refreshed)!;
        expect(second).not.toBe(first);

        // The access token from a refresh is accepted by the protected routes.
        await request(app)
            .get("/api/groups")
            .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
            .expect(200);

        await refresh(first).expect(401);

        // A second refresh in a row only works if the cookie holds the raw token, not its hash.
        const third = refreshCookieOf(await refresh(second).expect(200))!;

        await logout(third).expect(204);
        await refresh(third).expect(401);
    });

    it("stores the password and the refresh token only as hashes", async () => {
        const res = await register("alice").expect(201);
        const cookie = refreshCookieOf(res)!;

        expect(res.body.user).not.toHaveProperty("password");

        const user = await prisma.user.findUnique({
            where: { email: emailOf("alice") },
            omit: { password: false }
        });
        expect(user?.password).toMatch(/^\$argon2id\$/);

        const tokens = await prisma.refreshToken.findMany();
        expect(tokens).toEqual([expect.objectContaining({ token: hashToken(cookie), userId: user?.id })]);
    });

    it("rejects a second account with the same email", async () => {
        await register("alice").expect(201);

        await register("alice").expect(409);

        expect(await prisma.user.count()).toBe(1);
    });
});

describe("login", () => {
    it("accepts the registered password and rejects any other", async () => {
        await register("alice").expect(201);

        await login("alice").expect(200);
        await login("alice", "wrong password").expect(401);
    });

    it("ends the user's other sessions", async () => {
        const fromRegister = refreshCookieOf(await register("alice").expect(201))!;

        const fromLogin = refreshCookieOf(await login("alice").expect(200))!;

        await refresh(fromRegister).expect(401);
        await refresh(fromLogin).expect(200);
    });
});

describe("session isolation", () => {
    it("leaves other users' sessions alone when one user logs out", async () => {
        const alice = refreshCookieOf(await register("alice").expect(201))!;
        const bob = refreshCookieOf(await register("bob").expect(201))!;

        await logout(alice).expect(204);

        await refresh(bob).expect(200);
    });

    it("stops a soft-deleted user from refreshing", async () => {
        const res = await register("alice").expect(201);
        const cookie = refreshCookieOf(res)!;

        await prisma.user.softDelete({ where: { id: res.body.user.id } });

        await refresh(cookie).expect(401);
    });
});
