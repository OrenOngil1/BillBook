import { pino } from "pino";
import { env } from "./env.js";

export const logger = pino({
    level: env.LOG_LEVEL,
    redact: ["req.headers.authorization", "req.headers.cookie", "*.password"],
    transport: 
        env.NODE_ENV === "development" ? 
            { target: "pino-pretty" } :
            undefined
});