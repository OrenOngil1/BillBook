import type { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { Prisma } from "../generated/prisma/client.js";
import z from "zod";

const PRISMA_CLIENT_KNOWN_REQUEST_ERRORS: Record<string, { status: number, message: string}> = {
    P2002: { status: 409, message: "A record with that value already exists"},
    P2025: { status: 404, message: "Record not found"},
    P2003: { status: 409, message: "Cannot complete operation due to a related record constraint"}
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
    if (res.headersSent) {
        next(err);
        return;
    }
    if (err instanceof z.ZodError) {
        const issues = err.issues.map(({ path, message }) => ({
            path: path.join("."),
            message
        }));
        res.status(400).json({ error: issues });
        return;
    }
    if (createError.isHttpError(err)) {
        // http-errors sets expose=false for 5xx: those are our bugs; exposed ones are client mistakes.
        const logLevel = err.expose ? "warn" : "error";
        req.log[logLevel](err, "Http error in server");
        if (!err.expose) {
            res.status(err.status).json({ error: "Internal server error" });
            return;
        }
        if (err.type === "entity.parse.failed") {
            res.status(err.status).json({ error: "Malformed JSON body" });
            return;
        }
        res.status(err.status).json({ error: err.message });
        return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaError = PRISMA_CLIENT_KNOWN_REQUEST_ERRORS[err.code];
        if(prismaError) {
            res.status(prismaError.status).json({ error: prismaError.message });
            return;
        }
        req.log.error(err, "Prisma error");
        res.status(500).json({ error: "Database error" });
        return;
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
        req.log.error(err, "Malformed query to Prisma");
        res.status(500).json({ error: "Malformed parameters" });
        return;
    }
    req.log.error(err, "Error in server");
    res.status(500).json({ error: "Internal server error" });
}