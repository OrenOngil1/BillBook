import "dotenv/config";
import { pino, type LevelWithSilent } from "pino";
import z from "zod";

const envSchema = z.object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3_000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    JWT_ACCESS_SECRET: z.string().min(32),
    CORS_ORIGIN: z.url().default("http://localhost:5173"),
    LOG_LEVEL: z.enum([...Object.values(pino.levels.labels), "silent"] as LevelWithSilent[]).default("info")
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
    const issues = result.error.issues.map(({ path, message }) => ({
        path: path.join("."),
        message
    }));
    console.error("error on environment variables setup: ", issues);
    process.exit(1);
}

export const env = result.data;
