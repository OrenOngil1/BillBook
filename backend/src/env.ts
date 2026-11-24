import "dotenv/config";
import * as z from "zod";

const envSchema = z.object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3_000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    CORS_ORIGIN: z.url().default("http://localhost:5173")
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
