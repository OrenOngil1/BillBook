import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.js";
import { app } from "../src/app.js";
import { USER_ID_HEADER } from "../src/middleware/currentUser.js";
import { cleandb, createUser, createGroup, createExpense, type ShareInput } from "../prisma/factories.js";

const ROUTE = "/api/groups";
const SHARE_CENTS = 100_00;
const CURRENCY = "ILS";

beforeEach(async () => {
    await cleandb();
});

afterAll(async () => {
    await cleandb();
    await prisma.$disconnect();
});

function getGroup(groupId: number, userId: number) {
    return request(app).get(`${ROUTE}/${groupId}`).set(USER_ID_HEADER, String(userId));
}

function listGroups(userId: number) {
    return request(app).get(`${ROUTE}/`).set(USER_ID_HEADER, String(userId));
}

function postExpense(groupId: number, payerId: number, shares: ShareInput[]) {
    const amountCents = shares.reduce((total, share) => total + share.amountCents, 0);
    return request(app)
        .post(`${ROUTE}/${groupId}/expenses`)
        .set(USER_ID_HEADER, String(payerId))
        .send({ expense: { description: "dinner", amountCents, currency: CURRENCY }, shares });
}

async function createTrio() {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const carol = await createUser("carol");
    const group = await createGroup("trip", [alice.id, bob.id, carol.id]);
    return { alice, bob, carol, group };
}

function equalShares(...owerIds: number[]): ShareInput[] {
    return owerIds.map((owerId) => ({ owerId, amountCents: SHARE_CENTS }));
}

describe("groups", () => {
    it("creates a group, then returns it with its members", async () => {
        const alice = await createUser("alice");
        const bob = await createUser("bob");
        const expectedMembers = expect.arrayContaining([
            expect.objectContaining({ username: "alice" }),
            expect.objectContaining({ username: "bob" }),
        ]);

        const created = await request(app)
            .post(`${ROUTE}/`)
            .set(USER_ID_HEADER, String(alice.id))
            .send({ name: "group1", userIds: [alice.id, bob.id] })
            .expect(201);

        expect(created.body).toMatchObject({ id: expect.any(Number), name: "group1" });
        expect(created.body.members).toHaveLength(2);
        expect(created.body.members).toEqual(expectedMembers);

        const fetched = await getGroup(created.body.id, alice.id).expect(200);

        expect(fetched.body.group).toMatchObject({ id: created.body.id, name: "group1", expenses: [], settlements: [] });
        expect(fetched.body.group.members).toHaveLength(2);
        expect(fetched.body.group.members).toEqual(expectedMembers);
        expect(fetched.body.balances).toEqual([]);
    });

    it("returns 404 and creates nothing when a member id doesn't exist", async () => {
        const alice = await createUser("alice");
        const missingUserId = alice.id + 1000;

        await request(app)
            .post(`${ROUTE}/`)
            .set(USER_ID_HEADER, String(alice.id))
            .send({ name: "group1", userIds: [alice.id, missingUserId] })
            .expect(404);

        expect(await prisma.group.count()).toBe(0);
    });

    it("returns 404 to a user who isn't a member", async () => {
        const { alice, group } = await createTrio();
        const dave = await createUser("dave");

        await getGroup(group.id, dave.id).expect(404);
        await postExpense(group.id, dave.id, equalShares(dave.id, alice.id)).expect(404);

        expect(await prisma.expense.count()).toBe(0);
    });
});

describe("group list", () => {
    it("returns only the groups the user is a member of", async () => {
        const { alice, bob, group } = await createTrio();
        await createGroup("not alice's", [bob.id]);

        const res = await listGroups(alice.id).expect(200);

        expect(res.body).toHaveLength(1);
        expect(res.body[0].group).toMatchObject({ id: group.id, name: "trip" });
    });

    it("keeps each group's balances inside that group", async () => {
        const alice = await createUser("alice");
        const bob = await createUser("bob");
        const withExpense = await createGroup("with expense", [alice.id, bob.id]);
        const withoutExpense = await createGroup("without expense", [alice.id, bob.id]);
        await createExpense(withExpense.id, alice.id, "dinner", CURRENCY, equalShares(alice.id, bob.id));

        const res = await listGroups(alice.id).expect(200);

        expect(res.body).toHaveLength(2);
        expect(res.body).toEqual(expect.arrayContaining([
            {
                group: expect.objectContaining({ id: withExpense.id }),
                balances: [{ userId: bob.id, username: bob.username, currency: CURRENCY, amountCents: SHARE_CENTS }],
            },
            { group: expect.objectContaining({ id: withoutExpense.id }), balances: [] },
        ]));
    });

    it("ignores expenses the user has no part in", async () => {
        const { alice, bob, carol, group } = await createTrio();
        await createExpense(group.id, alice.id, "drinks", CURRENCY, equalShares(alice.id, bob.id));

        const res = await listGroups(carol.id).expect(200);

        expect(res.body).toEqual([{ group: expect.objectContaining({ id: group.id }), balances: [] }]);
    });

    it("returns an empty list to a user with no groups", async () => {
        const alice = await createUser("alice");

        const res = await listGroups(alice.id).expect(200);

        expect(res.body).toEqual([]);
    });

    it("leaves members, expenses and settlements out of the list", async () => {
        const { alice } = await createTrio();

        const res = await listGroups(alice.id).expect(200);

        expect(res.body[0].group).not.toHaveProperty("members");
        expect(res.body[0].group).not.toHaveProperty("expenses");
        expect(res.body[0].group).not.toHaveProperty("settlements");
    });
});

describe("expenses", () => {
    it("shows a new expense in the balances of the payer and of an ower", async () => {
        const { alice, bob, carol, group } = await createTrio();

        await postExpense(group.id, alice.id, equalShares(alice.id, bob.id, carol.id)).expect(201);

        const asPayer = await getGroup(group.id, alice.id).expect(200);
        expect(asPayer.body.balances).toHaveLength(2);
        expect(asPayer.body.balances).toEqual(expect.arrayContaining([
            { userId: bob.id, username: bob.username, currency: CURRENCY, amountCents: SHARE_CENTS },
            { userId: carol.id, username: carol.username, currency: CURRENCY, amountCents: SHARE_CENTS },
        ]));

        const asOwer = await getGroup(group.id, bob.id).expect(200);
        expect(asOwer.body.balances).toEqual([
            { userId: alice.id, username: alice.username, currency: CURRENCY, amountCents: -SHARE_CENTS },
        ]);
    });

    it("leaves a member's balance untouched by an expense they have no share in", async () => {
        const { alice, bob, carol, group } = await createTrio();
        await createExpense(group.id, alice.id, "drinks", CURRENCY, equalShares(alice.id, bob.id));

        const asCarol = await getGroup(group.id, carol.id).expect(200);

        expect(asCarol.body.group.expenses).toEqual([]);
        expect(asCarol.body.balances).toEqual([]);
    });

    it("rejects an expense with an ower outside the group and saves nothing", async () => {
        const { alice, group } = await createTrio();
        const dave = await createUser("dave");

        await postExpense(group.id, alice.id, equalShares(alice.id, dave.id)).expect(422);

        expect(await prisma.expense.count()).toBe(0);
        expect(await prisma.share.count()).toBe(0);
    });

    it("returns 409 and saves nothing when the same ower is listed twice", async () => {
        const { alice, group } = await createTrio();

        await postExpense(group.id, alice.id, equalShares(alice.id, alice.id)).expect(409);

        expect(await prisma.expense.count()).toBe(0);
        expect(await prisma.share.count()).toBe(0);
    });
});

describe("settlements", () => {
    it("reduces the debt between the two users by the settled amount", async () => {
        const { alice, bob, carol, group } = await createTrio();
        await createExpense(group.id, alice.id, "hotel", CURRENCY, equalShares(alice.id, bob.id, carol.id));

        await request(app)
            .post(`${ROUTE}/${group.id}/settlements`)
            .set(USER_ID_HEADER, String(bob.id))
            .send({ userToId: alice.id, amountCents: SHARE_CENTS, currency: CURRENCY })
            .expect(201);

        const asBob = await getGroup(group.id, bob.id).expect(200);
        expect(asBob.body.balances).toEqual([]);

        const asAlice = await getGroup(group.id, alice.id).expect(200);
        expect(asAlice.body.balances).toEqual([
            { userId: carol.id, username: carol.username, currency: CURRENCY, amountCents: SHARE_CENTS },
        ]);
    });
});
