import type { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { Prisma } from "../generated/prisma/client.js";

const PRISMA_CLIENT_KNOWN_REQUEST_ERRORS: Record<string, { status: number, message: string}> = {
    P2002: { status: 409, message: "A record with that value already exists"},
    P2025: { status: 404, message: "Record not found"},
    P2003: { status: 409, message: "Cannot complete operation due to a related record constraint"}
}

export function errorHandler(err: Error, _req: Request, res: Response, next: NextFunction) {
    if (res.headersSent) {
        next(err);
        return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaError = PRISMA_CLIENT_KNOWN_REQUEST_ERRORS[err.code];
        if(prismaError) {
            res.status(prismaError.status).json({ error: prismaError.message });
            return;
        }
        console.error(`Prisma error ${err.code}: ${err.message}`);
        res.status(500).json({ error: "Database error" });
        return;
    }
    if (createError.isHttpError(err)) {
        console.error("Http error in server:", err);
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
    // TODO: Change to 500 when validation lands
    if (err instanceof Prisma.PrismaClientValidationError) {
        console.error("Malformed query to Prisma:", err);
        res.status(400).json({ error: "Malformed parameters" });
        return;
    }
    console.error("Error in server:", err);
    res.status(500).json({ error: "Internal server error" });
}