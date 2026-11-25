import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

const SHUTDOWN_TIMEOUT = 5_000;

const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server listening");
});

let isShuttingDown = false;

function gracefulShutdown(signal: NodeJS.Signals) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    logger.info({ signal }, "Server received signal, starting graceful shutdown");

    const timeout = setTimeout(() => {
        logger.error("Graceful shutdown stalled, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    server.close(() => {
        prisma.$disconnect()
            .then(() => {
                clearTimeout(timeout);
                process.exit(0);
            })
            .catch((err: unknown) => {
                logger.error(err, "Resource disposal error");
                process.exit(1);
            });
    });
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);