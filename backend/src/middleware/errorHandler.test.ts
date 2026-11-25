import { describe, it, expect } from "vitest";
import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import createError from "http-errors";
import { Prisma } from "../generated/prisma/client.js";
import { errorHandler } from "./errorHandler.js";

const ROUTE = "/boom";
const SECRET = "secret detail";

function appThatThrows(err: Error) {
    const app = express();
    app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
    app.use(express.json());
    app.all(ROUTE, () => {
        throw err;
    });
    app.use(errorHandler);
    return app;
}

describe("errorHandler", () => {
    it("hides the message of a 5xx http error", async () => {
        const res = await request(appThatThrows(createError(503, SECRET))).get(ROUTE).expect(503);

        expect(res.body).toEqual({ error: "Internal server error" });
    });

    it("returns 400 with its own message for a malformed JSON body", async () => {
        const res = await request(appThatThrows(new Error(SECRET)))
            .post(ROUTE)
            .set("Content-Type", "application/json")
            .send("{ broken")
            .expect(400);

        expect(res.body).toEqual({ error: "Malformed JSON body" });
    });

    it("returns a generic 500 for a Prisma error code it doesn't know", async () => {
        const unknownPrismaError = new Prisma.PrismaClientKnownRequestError(SECRET, {
            code: "P9999",
            clientVersion: "test"
        });

        const res = await request(appThatThrows(unknownPrismaError)).get(ROUTE).expect(500);

        expect(res.body).toEqual({ error: "Database error" });
    });
});
