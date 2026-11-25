import type { Request, Response, NextFunction } from "express";
import type { Role } from "../generated/prisma/enums.js";

export function authorize(...allowed: Role[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!allowed.includes(req.user!.role)) {
            res.status(403).json({ error: "Forbbiden" });
            return;
        }

        next();
    }
}