import { vi, describe, it, beforeAll, beforeEach, expect } from "vitest";
import request from "supertest";
import { prismaMock } from "../../tests/mocks/prisma.js";

vi.mock("../db.ts", () => ({
    prisma: prismaMock
}));

// The real auth limiter allows 5 failed requests per window; this file sends more than that on purpose.
vi.mock("../middleware/rateLimiter.ts", () => {
    const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
    return { apiLimiter: passThrough, authLimiter: passThrough };
});

import { app } from "../app.js";
import { hashPassword, hashToken } from "../utils/hashing.js";
import { daysFrom } from "../utils/time.js";
import { refreshCookieOf, withRefreshCookie } from "../../tests/auth.js";
import type { User } from "../generated/prisma/client.js";

const ROUTE = "/api/auth";
const PASSWORD = "correct horse battery";
const OLD_TOKEN = "old-refresh-token";
const INVALID_CREDENTIALS = "Invalid email or password";
const INVALID_TOKEN = "Missing or invalid token";
const USER = {
    id: 1,
    email: "alice@example.com",
    username: "alice",
    role: "USER",
    createdAt: new Date(),
    updatedAt: new Date()
} as User;

let passwordHash: string;

beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
});

// Interactive transactions get the mock as `tx`; batch transactions just await their queries.
function runTransaction(arg: unknown) {
    return typeof arg === "function" ? arg(prismaMock) : Promise.all(arg as unknown[]);
}

beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(runTransaction as never);
});

function storedToken(expiresAt: Date) {
    return { token: hashToken(OLD_TOKEN), createdAt: new Date(), expiresAt, userId: USER.id, user: USER };
}

describe(`POST ${ROUTE}/register`, () => {
    function register(password = PASSWORD) {
        return request(app)
            .post(`${ROUTE}/register`)
            .send({ email: USER.email, username: USER.username, password });
    }

    it("creates the user with an argon2 hash, never the plain password", async () => {
        prismaMock.user.create.mockResolvedValue(USER);

        const res = await register().expect(201);

        expect(res.body.accessToken).toEqual(expect.any(String));
        expect(prismaMock.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ password: expect.stringMatching(/^\$argon2id\$/) })
        });
    });

    it("stores only the hash of the refresh token it puts in the cookie", async () => {
        prismaMock.user.create.mockResolvedValue(USER);

        const res = await register().expect(201);
        const cookie = refreshCookieOf(res)!;

        expect(cookie).toBeTruthy();
        expect(prismaMock.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                refreshTokens: { create: expect.objectContaining({ token: hashToken(cookie) }) }
            })
        });
    });

    it("sets the refresh cookie httpOnly, strict and scoped to the auth routes", async () => {
        prismaMock.user.create.mockResolvedValue(USER);

        const res = await register().expect(201);
        const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";");

        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Strict");
        expect(setCookie).toContain(`Path=${ROUTE}`);
    });

    it("returns 400 and creates nothing when the password is too short", async () => {
        await register("short").expect(400);

        expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
});

describe(`POST ${ROUTE}/login`, () => {
    function login(password = PASSWORD) {
        return request(app).post(`${ROUTE}/login`).send({ email: USER.email, password });
    }

    it("returns an access token and the user without its password", async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...USER, password: passwordHash });

        const res = await login().expect(200);

        expect(res.body.accessToken).toEqual(expect.any(String));
        expect(res.body.user).toMatchObject({ id: USER.id });
        expect(res.body.user).not.toHaveProperty("password");
    });

    it("revokes the user's other sessions and stores only the new token's hash", async () => {
        prismaMock.user.findUnique.mockResolvedValue({ ...USER, password: passwordHash });

        const res = await login().expect(200);
        const cookie = refreshCookieOf(res)!;

        expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: USER.id } });
        expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ token: hashToken(cookie) })
        });
    });

    it.each([
        { cond: "the email is unknown", found: null, password: PASSWORD },
        { cond: "the password is wrong", found: "withPassword", password: "wrong password" },
        { cond: "the user has no password yet", found: "withoutPassword", password: PASSWORD }
    ])("returns 401 and starts no session when $cond", async ({ found, password }) => {
        const user = found && { ...USER, password: found === "withPassword" ? passwordHash : null };
        prismaMock.user.findUnique.mockResolvedValue(user as User | null);

        const res = await login(password).expect(401);

        expect(res.body.error).toBe(INVALID_CREDENTIALS);
        expect(refreshCookieOf(res)).toBeUndefined();
        expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });
});

describe(`POST ${ROUTE}/refresh`, () => {
    function refresh() {
        return request(app).post(`${ROUTE}/refresh`).set(withRefreshCookie(OLD_TOKEN));
    }

    it("swaps the old token for a new one, looking it up by its hash", async () => {
        prismaMock.refreshToken.findUnique.mockResolvedValue(storedToken(daysFrom(1)) as never);
        prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

        const res = await refresh().expect(200);
        const newCookie = refreshCookieOf(res)!;

        expect(res.body.accessToken).toEqual(expect.any(String));
        expect(newCookie).toBeTruthy();
        expect(newCookie).not.toBe(OLD_TOKEN);
        expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ token: hashToken(OLD_TOKEN) })
        }));
        expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: hashToken(OLD_TOKEN) } });
        expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ token: hashToken(newCookie) })
        });
    });

    it("returns 401 without touching the database when there's no cookie", async () => {
        const res = await request(app).post(`${ROUTE}/refresh`).expect(401);

        expect(res.body.error).toBe(INVALID_TOKEN);
        expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it.each([
        { cond: "the token is unknown", stored: null },
        { cond: "the token has expired", stored: storedToken(daysFrom(-1)) }
    ])("returns 401 and clears the cookie when $cond", async ({ stored }) => {
        prismaMock.refreshToken.findUnique.mockResolvedValue(stored as never);

        const res = await refresh().expect(401);

        expect(res.body.error).toBe(INVALID_TOKEN);
        expect(refreshCookieOf(res)).toBe("");
        expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it("returns 401 when a concurrent refresh already used the token", async () => {
        prismaMock.refreshToken.findUnique.mockResolvedValue(storedToken(daysFrom(1)) as never);
        prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

        await refresh().expect(401);

        expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });
});

describe(`POST ${ROUTE}/logout`, () => {
    it("deletes only the session in the cookie and clears it", async () => {
        const res = await request(app)
            .post(`${ROUTE}/logout`)
            .set(withRefreshCookie(OLD_TOKEN))
            .expect(204);

        expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: hashToken(OLD_TOKEN) } });
        expect(refreshCookieOf(res)).toBe("");
    });

    it("returns 204 and deletes nothing when there's no cookie", async () => {
        await request(app).post(`${ROUTE}/logout`).expect(204);

        expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled();
    });
});
