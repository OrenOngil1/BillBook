import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import { assertGroupMembers } from '../domain/groups.js';
import { calculateBalance } from '../domain/balances.js';
import { assertValidSplit } from '../domain/expenses.js';
import { authenticate } from '../middleware/authenticate.js';
import { createExpenseSchema, createGroupSchema, createSettlementSchema } from '../schemas/groups.js';
import type { CreateExpenseInput, CreateGroupInput, CreateSettlementInput } from '../schemas/groups.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get("/", authenticate, async (req: Request, res: Response) => {
    const { id: userId, role } = req.user!;

    const groupsFullDetails = await prisma.group.findMany({
        where: role === "ADMIN" ? {} : { members: { some: { id: userId } } },
        omit: { updatedAt: true },
        include: {
            members: {
                select: { id: true, username: true },
                where: { deletedAt: null }
            },
            expenses: {
                where: {
                    OR: [
                        { payerId: userId },
                        { shares: { some: { owerId: userId } } }
                    ]
                },
                include: { shares: { select: { owerId: true, amountCents: true } } }
            },
            settlements: {
                where: {
                    OR: [
                        { userFromId: userId },
                        { userToId: userId }
                    ]
                }
            }
        }
    });

    const resBody = groupsFullDetails.map((groupFullDetails) => {
        const balances = calculateBalance(groupFullDetails, userId);
        const { members, expenses, settlements, ...group } = groupFullDetails;
        return { group, balances };
    });

    res.json(resBody);
});

router.get("/:id", authenticate, async (req: Request, res: Response) => {

    const groupId = Number(req.params.id);
    const { id: userId, role } = req.user!;

    const group = await prisma.group.findUnique({
        where: { id: groupId },
        omit: { updatedAt: true },
        include: {
            members: {
                select: { id: true, username: true },
                where: { deletedAt: null }
            },
            expenses: {
                where: {
                    OR: [
                        { payerId: userId },
                        { shares: { some: { owerId: userId } } }
                    ]
                },
                include: { shares: { select: { owerId: true, amountCents: true } } }
            },
            settlements: {
                where: {
                    OR: [
                        { userFromId: userId },
                        { userToId: userId }
                    ]
                }
            }
        }
    });

    if(!group || (group.members.every((member) => member.id !== userId) && role !== "ADMIN")) {
        res.status(404).json({ error: "Group not found" });
        return;
    }

    const balances = calculateBalance(group, userId);

    res.json({ group, balances });
});

router.post("/", authenticate, validate(createGroupSchema), async (req: Request, res: Response) => {
    const { id: userId } = req.user!
    const { name, memberIds } = req.body as CreateGroupInput;

    const group = await prisma.group.create({
        omit: { updatedAt: true },
        data: {
            name,
            members: {
                connect: [...memberIds.map((id: number) => ({ id })), { id: userId }],
            }
        },
        include: {
            members: {
                select: { id: true, username: true }
            }
        }
    });

    res.status(201).json(group);
});

router.post("/:id/expenses", authenticate, validate(createExpenseSchema), async (req: Request, res: Response) => {
    const groupId = Number(req.params.id);
    const { id: payerId } = req.user!;
    const { expense, shares } = req.body as CreateExpenseInput;
    const { description, amountCents, currency } = expense;

    assertValidSplit({ ...expense, payerId }, shares);
    await assertGroupMembers(
        groupId,
        payerId,
        ...shares.map((shr) => shr.owerId)
    );

    const result = await prisma.expense.create({
        omit: { updatedAt: true },
        data: {
            description,
            amountCents,
            currency,
            payer: { connect: { id: payerId } },
            group: { connect: { id: groupId } },
            shares: { create: shares }
        },
        include: {
            shares: true
        }
    });

    res.status(201).json(result);
});

router.post("/:id/settlements", authenticate, validate(createSettlementSchema), async (req: Request, res: Response) => {
    const groupId = Number(req.params.id);
    const { id: userFromId } = req.user!;
    const { userToId, amountCents, currency } = req.body as CreateSettlementInput;

    if (userFromId === userToId) {
        res.status(422).json({ error: "You can't settle with yourself" })
        return;
    }

    await assertGroupMembers(groupId, userFromId, userToId);
    
    const result = await prisma.settlement.create({
        data: {
            amountCents, currency,
            group: { connect: { id: groupId } },
            userFrom: { connect: { id: userFromId }},
            userTo: { connect: { id: userToId } }
        },
        
    });

    res.status(201).json(result);
});

export default router;
