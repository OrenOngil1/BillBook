import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";
import { softDelete } from "./extentions/softDelete.js";

function createPrismaClient() {
    const adapter = new PrismaPg({
        connectionString: env.DATABASE_URL
    });
    return new PrismaClient({ 
        adapter, 
        omit: {
            user: {
                password: true,
                deletedAt: true
            }
        }
    }).$extends(softDelete);
}

const globalForPrisma = globalThis as typeof globalThis & { 
    prisma: ReturnType<typeof createPrismaClient> | undefined 
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;    
} 