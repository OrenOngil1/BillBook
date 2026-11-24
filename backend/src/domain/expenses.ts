import createError from "http-errors";
import type { Expense, Share } from "../generated/prisma/client.js";

export function assertValidSplit(expense: Expense, shares: Share[]) {
    if (shares.length < 1) {
        throw createError(422, "Expenses must be shared by some people");
    }

    if (!shares.some((share) => share.owerId === expense.payerId)) {
        throw createError(422, "Payer must have a share of his own expense");
    }

    const total = shares.reduce((acc: number, share) => share.amountCents + acc, 0);
    if (total !== expense.amountCents) {
        throw createError(422, "Total of shares must be equal to the expene");
    }
}