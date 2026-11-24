import { prisma } from "../src/db.js";
import type { Currency } from "../src/generated/prisma/enums.js";

export type ShareInput = { owerId: number; amountCents: number };

export async function cleandb() {
    // TRUNCATE rather than deleteMany so ids restart at 1: a re-seeded alice stays user 1 (VITE_DEV_USER_ID).
    // CASCADE empties every table that references these two: expenses, shares, settlements, memberships.
    await prisma.$executeRaw`TRUNCATE TABLE "User", "Group" RESTART IDENTITY CASCADE`;
}

export function createUser(username: string) {
    return prisma.user.create({ data: { username, email: `${username}@example.com` } });
}

export function createGroup(name: string, memberIds: number[]) {
    return prisma.group.create({
        data: { name, members: { connect: memberIds.map((id) => ({ id })) } },
    });
}

// The total is derived from the shares, so a created expense always satisfies "shares add up".
export function createExpense(
    groupId: number,
    payerId: number,
    description: string,
    currency: Currency,
    shares: ShareInput[]
) {
    return prisma.expense.create({
        data: {
            groupId,
            payerId,
            description,
            currency,
            amountCents: shares.reduce((total, share) => total + share.amountCents, 0),
            shares: { create: shares },
        },
    });
}
