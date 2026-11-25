import { vi, describe, it, beforeEach, expect } from "vitest";
import { prismaMock } from "../../tests/mocks/prisma.js";
import request from "supertest";

vi.mock("../db.ts", () => ({
    prisma: prismaMock
}));

import { app } from "../app.js";
import { bearer } from "../../tests/auth.js";
import type { Expense, Group, Settlement, User } from "../generated/prisma/client.js";
import type { GroupForBalances } from "../domain/balances.js";

const ROUTE = "/api/groups";
const USER_ID = 1;

beforeEach(() => {
    vi.resetAllMocks();
});

describe("group routes", () => {
    it("returns a group", async () => {
        const group = {
            id: 1,
            name: "group1",
            members: [{ id: 1 }],
            expenses: [],
            settlements: []
        };
        prismaMock.group.findUnique.mockResolvedValue(group as unknown as (Group & GroupForBalances));
        const res = await request(app)
            .get(`${ROUTE}/${group.id}`)
            .set(await bearer(group.members[0]!.id))
            .expect(200);
        
        expect(res.body.group.name).toStrictEqual(group.name);
    });

    it("creates a group", async () => {
        const group = { name: "group1", userIds: [{ id: 1 }] };
        prismaMock.group.create.mockResolvedValue(group as unknown as (Group & { membersIds: number[] }));

        const res = await request(app)
            .post(`${ROUTE}/`)
            .set(await bearer(USER_ID))
            .send({ name: group.name, memberIds: group.userIds.map(({ id }) => id) })
            .expect(201);

        expect(res.body.name).toStrictEqual(group.name);
    });

    it("creates a new expense paid by the token's user, ignoring any payerId in the body", async () => {
        const expense = {
            groupId: 1,
            payerId: 2,
            description: "expense1", 
            amountCents: 1_00, 
            currency: "ILS"
        }
        const shares = [
            {
                owerId: 1, 
                amountCents: 50, 
            },
            {
                owerId: 2, 
                amountCents: 50, 
            },
        ];
        prismaMock.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as User[]);
        prismaMock.expense.create.mockResolvedValue(expense as Expense);

        const res = await request(app)
            .post(`${ROUTE}/${expense.groupId}/expenses`)
            .set(await bearer(USER_ID))
            .send({ expense, shares })
            .expect(201);
        
        expect(res.body.description).toStrictEqual(expense.description);
        expect(prismaMock.expense.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ payer: { connect: { id: USER_ID } } })
        }));
    });

    it("creates a new settlement from the token's user, ignoring any userFromId in the body", async () => {
        const settlement = {
            amountCents: 1_00,
            currency: "ILS",
            userFromId: 3,
            userToId: 2
        };
        prismaMock.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as User[]);
        prismaMock.settlement.create.mockResolvedValue(settlement as Settlement);

        await request(app)
            .post(`${ROUTE}/1/settlements`)
            .set(await bearer(USER_ID))
            .send(settlement)
            .expect(201);

        expect(prismaMock.settlement.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ userFrom: { connect: { id: USER_ID } } })
        }));
    });
});

describe(`GET ${ROUTE}/:id`, () => {

    it.each([
        { cond: "group doesn't exist", userId: 1, findUniqueValue: null },
        { cond: "user isn't a member", userId: 2, findUniqueValue: { 
            id: 1, name: "group1", members: [{ id: 1 }], expenses: [], settlements: []
        } }
    ])("returns 404 for when $cond", async ({ userId, findUniqueValue }) => {
        prismaMock.group.findUnique.mockResolvedValue(findUniqueValue as (Group & GroupForBalances) | null);

        const res = await request(app)
            .get(`${ROUTE}/1`)
            .set(await bearer(userId))
            .expect(404);

        expect((res.body.error as string).toLowerCase()).toMatch(/group|not|found/i);
    });
});

describe(`POST ${ROUTE}/`, () => {
    it("adds the creator as a member even when memberIds is empty", async () => {
        await request(app)
            .post(`${ROUTE}/`)
            .set(await bearer(USER_ID))
            .send({ name: "just me", memberIds: [] })
            .expect(201);

        expect(prismaMock.group.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ members: { connect: [{ id: USER_ID }] } })
        }));
    });
})

describe(`POST ${ROUTE}/:id/expenses`, () => {
    // The sender's token identifies the payer.
    it.each([
        { cond: "group not found", groupId: 0, senderId: 1, memberId: 2, findManyValue: [] }, 
        { cond: "sender is not a member", groupId: 1, senderId: 3, memberId: 1, findManyValue: [{ id: 1 }] }
    ])("returns 404 when $cond", async ({ groupId, senderId, memberId, findManyValue }) => {
       const expense = {
        description: "I belong to no group",
        amountCents: 20_00,
        currency: "ILS"
       };
       const shares = [
        { 
            owerId: senderId, 
            amountCents: 10_00, 
        },
        {
            owerId: memberId,
            amountCents: 10_00
        }
       ];
       prismaMock.user.findMany.mockResolvedValue(findManyValue as User[]);

       const res = await request(app)
            .post(`${ROUTE}/${groupId}/expenses`)
            .set(await bearer(senderId))
            .send({ expense, shares })
            .expect(404)
        
        expect(prismaMock.expense.create).not.toHaveBeenCalled();
        expect((res.body.error as string).toLowerCase()).toMatch(/group|not|found/i);
    });

    it("returns 422 when zero shares in an expense", async () => {
        const expense = {
            description: "expense 1",
            amountCents: 10_00,
            currency: "ILS"
        };

        const res = await request(app)
            .post(`${ROUTE}/1/expenses`)
            .set(await bearer(USER_ID))
            .send({ expense, shares: [] })
            .expect(422);
        
        expect(prismaMock.expense.create).not.toHaveBeenCalled();
        expect((res.body.error as string).toLowerCase()).toMatch(/expense|share|people/i);
    });

    it("returns 422 when the total amount of money in an expense is not the sum of its shares", async () => {
        const expense = {
            description: "expense 1",
            amountCents: 10_00,
            currency: "ILS"
        };

        const shares = [
            {
                owerId: 1, 
                amountCents: 50, 
            },
            {
                owerId: 2, 
                amountCents: 50, 
            },
        ];
        
        const res = await request(app)
            .post(`${ROUTE}/1/expenses`)
            .set(await bearer(USER_ID))
            .send({ expense, shares })
            .expect(422);
        
        expect(prismaMock.expense.create).not.toHaveBeenCalled();
        expect((res.body.error as string).toLowerCase()).toMatch(/payer|share|expense/i);
    });

    it("returns 422 when the creditor doesn't have a share", async () => {
        const expense = {
            description: "expense 1",
            amountCents: 10_00,
            currency: "ILS"
        };

        const shares = [
            { owerId: 2, amountCents: 10_00 },
        ];
        
        const res = await request(app)
            .post(`${ROUTE}/1/expenses`)
            .set(await bearer(USER_ID))
            .send({ expense, shares })
            .expect(422);
        
        expect(prismaMock.expense.create).not.toHaveBeenCalled();
        expect((res.body.error as string).toLowerCase()).toMatch(/expense|share|people/i);
    })
});


describe(`POST ${ROUTE}/:id/settlements`, () => {
    it("returns 422 when a user tries to settle with himself", async () => {
        const settlement = {
            amountCents: 100,
            currency: "ILS",
            userToId: 1
        };
        prismaMock.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as User[]);

        const res = await request(app)
            .post(`${ROUTE}/1/settlements`)
            .set(await bearer(USER_ID))
            .send(settlement)
            .expect(422);

        expect(prismaMock.settlement.create).not.toHaveBeenCalled();
        expect((res.body.error as string).toLowerCase()).toMatch(/settle|someone else/i);
    });
});

describe("authentication", () => {
    it.each([
        { cond: "the header is missing", headers: {} },
        { cond: "the header isn't a bearer token", headers: { Authorization: "Basic abc" } },
        { cond: "the token isn't a valid JWT", headers: { Authorization: "Bearer abc" } }
    ])("returns 401 when $cond", async ({ headers }) => {
        await request(app).get(`${ROUTE}/`).set(headers).expect(401);

        expect(prismaMock.group.findMany).not.toHaveBeenCalled();
    });
});
