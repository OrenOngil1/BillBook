import type { Request, Response, NextFunction } from "express";
import createError from "http-errors";

export const USER_ID_HEADER = "X-User-Id";

// Pre-auth stand-in: trusts the header. When auth lands, read the id from the verified token instead.
export function currentUser(req: Request, _res: Response, next: NextFunction) {
    const userId = Number(req.get(USER_ID_HEADER));
    if (!Number.isInteger(userId) || userId < 1) {
        throw createError(401, `Missing or invalid ${USER_ID_HEADER} header`);
    }
    req.userId = userId;
    next();
}
