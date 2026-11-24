import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import { assertGroupMembers } from '../domain/groups.js';
import { calculateBalance } from '../domain/balances.js';
import { assertValidSplit } from '../domain/expenses.js';
import type { Expense, Share } from '../generated/prisma/client.js';

const router = Router();

router.get("/", async (req: Request, res: Response) => {
    const { userId } = req;
    const groupsFullDetails = await prisma.group.findMany({
        where: { members: { some: { id: userId } } },
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

router.get("/:id", async (req: Request, res: Response) => {

    const groupId = Number(req.params.id);
    const { userId } = req;

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

    if(!group || !group.members.some((member) => member.id === userId)) {
        res.status(404).json({ error: "Group not found" });
        return;
    }

    const balances = calculateBalance(group, userId);

    res.json({ group, balances });
});

router.post("/", async (req: Request, res: Response) => {
    const { name, userIds } = req.body;
    if (userIds.length < 1) {
        res.status(422).json({ error: "A group must have at least one member" });
        return;
    }

    const group = await prisma.group.create({
        omit: { updatedAt: true },
        data: {
            name,
            members: {
                connect: userIds.map((id: number) => ({ id })),
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

router.post("/:id/expenses", async (req: Request, res: Response) => {
    const groupId = Number(req.params.id);
    const payerId = req.userId;
    const { expense, shares } = req.body;
    const { description, amountCents, currency }: Expense = expense;

    assertValidSplit({ ...expense, payerId }, shares);
    await assertGroupMembers(
        groupId,
        payerId,
        ...shares.map(({ owerId } : Share) => owerId)
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

router.post("/:id/settlements", async (req: Request, res: Response) => {
    const groupId = Number(req.params.id);
    const userFromId = req.userId;
    const { userToId, amountCents, currency } = req.body;

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
