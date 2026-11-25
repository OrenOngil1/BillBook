import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { errors } from "jose";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Missing or invalid token" });
        return;
    }
    const accessToken = authHeader.split(" ")[1];
    try {
        req.user = await verifyAccessToken(accessToken);
    } catch (err) {
        if (err instanceof errors.JWTExpired) {
            res.status(401).json({ error: "Expired Access Token" });
            return;
        }
        res.status(401).json({ error: "Missing or invalid token" });
        return;
    }

    next();
}