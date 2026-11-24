import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

export function setup(project: TestProject) {
    execSync("npx prisma migrate deploy", {
        stdio: "inherit", env: { ...process.env, ...project.config.env },
    });
}
