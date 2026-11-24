import { Prisma } from "../generated/prisma/client.js";

// Hard deletes must reach soft-deleted users; creates take no where.
const UNFILTERED_OPERATIONS = new Set<string>(["delete", "deleteMany", "create", "createMany", "createManyAndReturn"]);

export const softDelete = Prisma.defineExtension({
    model: {
        user: {
            softDelete(args: Prisma.UserDeleteArgs) {
                const ctx = Prisma.getExtensionContext(this)
                return ctx.update({
                    ...args,
                    where: { ...args.where, deletedAt: null },
                    data: {
                        email: null,
                        username: null,
                        deletedAt: new Date()
                    }
                });
            },
            softDeleteMany(args: Prisma.UserDeleteManyArgs) {
                const ctx = Prisma.getExtensionContext(this);
                return ctx.updateMany({
                    ...args,
                    where: { ...args.where, deletedAt: null },
                    data: {
                        email: null,
                        username: null,
                        deletedAt: new Date()
                    }
                });
            }
        }
    },
    query: {
        user: {
            async $allOperations({ operation, args, query }) {
                if (UNFILTERED_OPERATIONS.has(operation)) return query(args);
                const { where } = args as { where?: Prisma.UserWhereInput };
                return query({ ...args, where: { ...where, deletedAt: where?.deletedAt ?? null } });
            }
        }
    }
});
