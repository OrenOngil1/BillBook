import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";

const SHUTDOWN_TIMEOUT = 5_000;

const server = app.listen(env.PORT, () => {
    console.log("Server listening on port", env.PORT);
});

let isShuttingDown = false;

function gracefulShutdown(signal: NodeJS.Signals) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    console.log(`Server received signal ${signal}, starting gracefule shutdown`);

    const timeout = setTimeout(() => {
        console.error("Graceful shutdown stalled, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    server.close(async () => {
        try {
            await prisma.$disconnect();
        } catch(err) {
            console.error("Resource disposale error:", err);
            process.exit(1);
        }

        clearTimeout(timeout);
        process.exit(0);
    });
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);