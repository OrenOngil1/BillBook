import z from "zod";
import { Currency } from "../generated/prisma/enums.js";

const expenseSchema = z.object({
    description: z.string().min(1, "Describe what you paid for"),
    amountCents: z.int().positive("You must pay a positive amounnt"),
    currency: z.enum(Object.values(Currency))
});

const shareSchema = z.object({
    owerId: z.int(),
    amountCents: z.int().positive("User must pay some amount")
});

export const createGroupSchema = z.object({
    name: z.string().min(1, "A group must have a name"),
    memberIds: z.array(z.number())
});

export const createExpenseSchema = z.object({
    expense: expenseSchema,
    shares: z.array(shareSchema)
});

export const createSettlementSchema = z.object({
    userToId: z.int(),
    amountCents: z.int().positive("Can't settle for money from another user"),
    currency: z.enum(Object.values(Currency))
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;