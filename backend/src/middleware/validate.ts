import z from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodType) {
    return (req: Request, _res: Response, next: NextFunction) => {
        req.body = schema.parse(req.body);
        next();
    }
}