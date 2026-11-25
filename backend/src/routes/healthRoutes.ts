import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db.js';

const router = Router();

router.get("/healthz", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

router.get("/readyz", async (_req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: "ready" });
    } catch {
        res.status(503).json({ status: "not ready" });
    }
});

export default router;