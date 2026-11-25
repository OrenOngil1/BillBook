import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

const SHUTDOWN_TIMEOUT = 5_000;

const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
});

let isShuttingDown = false;

function gracefulShutdown(signal: NodeJS.Signals) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    logger.info(`Server received signal ${signal}, starting gracefule shutdown`);

    const timeout = setTimeout(() => {
        logger.error("Graceful shutdown stalled, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    server.close(async () => {
        try {
            await prisma.$disconnect();
        } catch(err) {
            logger.error(err, "Resource disposale error");
            process.exit(1);
        }

        clearTimeout(timeout);
        process.exit(0);
    });
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);