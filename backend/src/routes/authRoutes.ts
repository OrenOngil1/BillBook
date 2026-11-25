import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { hashPassword, hashToken, verifyPassword } from "../utils/hashing.js";
import { createAccessToken, createRefreshToken } from "../utils/jwt.js";
import { clearRefreshToken, setRefreshToken } from "../utils/cookies.js";
import createHttpError from "http-errors";
import { daysFrom } from "../utils/time.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "../schemas/auth.js";

const DUMMY_PASSWORD_HASH = await hashPassword(randomUUID());

const router = Router();

router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
    const { email, username, password } = req.body as RegisterInput;

    const hashedPassword = await hashPassword(password);

    const refreshToken = createRefreshToken();

    const user = await prisma.user.create({
        data: {
            email,
            username,
            password: hashedPassword,
            refreshTokens: {
                create: {
                    token: hashToken(refreshToken),
                    expiresAt: daysFrom(7)
                }
            }
        }
    });

    setRefreshToken(res, refreshToken);

    res.status(201).json({
        user, 
        accessToken: await createAccessToken(user.id, user.role)
    });
});

router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;
    const found = await prisma.user.findUnique({
        where: { email },
        omit: { password: false }
    });

    // Always run argon2 so response time doesn't reveal whether the email exists.
    const passwordMatches = await verifyPassword(found?.password ?? DUMMY_PASSWORD_HASH, password);
    if (!found || !passwordMatches) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
    }

    const { password: _, ...user } = found;

    const accessToken = await createAccessToken(user.id, user.role);
    const refreshToken = createRefreshToken();

    await prisma.$transaction([
        prisma.refreshToken.deleteMany({
            where: { userId: user.id }
        }),
        prisma.refreshToken.create({
            data: {
                token: hashToken(refreshToken),
                expiresAt: daysFrom(7),
                user: { connect: { id: user.id } }
            },
        })
    ]);

    setRefreshToken(res, refreshToken);
    res.status(200).json({ user, accessToken });
});

router.post("/refresh", async (req: Request, res: Response) => {
    const oldToken: unknown = req.cookies.refreshToken;
    if (typeof oldToken !== "string") {
        res.status(401).json({ error: "Missing or invalid token" });
        return;
    }
    const hashedOldToken = hashToken(oldToken);

    const { refreshToken, ...session } = await prisma.$transaction(async (tx) => {        
        const stored = await tx.refreshToken.findUnique({ 
            where: { 
                token: hashedOldToken, 
                user: { deletedAt: null }
            },
            include: { 
                user: true
            } 
        });

        if (!stored || stored.expiresAt < new Date()) {
            clearRefreshToken(res);
            throw createHttpError(401, "Missing or invalid token");
        }

        const { count } = await tx.refreshToken.deleteMany({
            where: { token: hashedOldToken }
        });
        if (count == 0) {
            throw createHttpError(401, "Missing or invalid token");
        }

        const accessToken = await createAccessToken(stored.user.id, stored.user.role);
        const refreshToken = createRefreshToken();

        await tx.refreshToken.create({
            data: { 
                token: hashToken(refreshToken),
                expiresAt: daysFrom(7),
                user: { connect: { id: stored.user.id } }
            },
        });

        return { user: stored.user, accessToken, refreshToken };
    });

    setRefreshToken(res, refreshToken);
    res.status(200).json(session);
});


router.post("/logout", async (req: Request, res: Response) => {
    const refreshToken: unknown = req.cookies.refreshToken;
    if (typeof refreshToken !== "string") {
        res.status(204).end();
        return;
    }

    await prisma.refreshToken.deleteMany({
        where: { token: hashToken(refreshToken)  }
    });

    clearRefreshToken(res);
    res.status(204).end();
});

export default router;