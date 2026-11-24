import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.js";
import { app } from "../src/app.js";
import { USER_ID_HEADER } from "../src/middleware/currentUser.js";
import { cleandb, createUser, createGroup } from "../prisma/factories.js";

const SHARE_CENTS = 100_00;

beforeEach(async () => {
    await cleandb();
});

afterAll(async () => {
    await cleandb();
    await prisma.$disconnect();
});

describe("soft delete", () => {
    it("hides a soft-deleted user from lookups but keeps the row, without personal data", async () => {
        const alice = await createUser("alice");
        const bob = await createUser("bob");

        await prisma.user.softDelete({ where: { id: alice.id } });

        expect(await prisma.user.findUnique({ where: { id: alice.id } })).toBeNull();
        expect(await prisma.user.findMany()).toEqual([expect.objectContaining({ id: bob.id })]);

        // An explicit deletedAt filter opts out of the extension's default.
        const deletedRow = await prisma.user.findUnique({ where: { id: alice.id, deletedAt: { not: null } } });
        expect(deletedRow).toMatchObject({ id: alice.id, email: null, username: null });
    });

    it("stops a soft-deleted member from paying for a new expense", async () => {
        const alice = await createUser("alice");
        const bob = await createUser("bob");
        const group = await createGroup("flat", [alice.id, bob.id]);
        await prisma.user.softDelete({ where: { id: alice.id } });

        await request(app)
            .post(`/api/groups/${group.id}/expenses`)
            .set(USER_ID_HEADER, String(alice.id))
            .send({
                expense: { description: "rent", amountCents: 2 * SHARE_CENTS, currency: "ILS" },
                shares: [
                    { owerId: alice.id, amountCents: SHARE_CENTS },
                    { owerId: bob.id, amountCents: SHARE_CENTS },
                ],
            })
            .expect(404);

        expect(await prisma.expense.count()).toBe(0);
    });
});
