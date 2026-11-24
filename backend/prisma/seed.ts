import { prisma } from "../src/db.js";
import { env } from "../src/env.js";
import { Currency } from "../src/generated/prisma/enums.js";
import { cleandb, createExpense, createGroup, createUser } from "./factories.js";

if (env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production");
}

async function main() {
    await cleandb();

    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const carol = await createUser("carol");
    const dave = await createUser("dave");

    const trip = await createGroup("Eilat trip", [alice.id, bob.id, carol.id]);

    await createExpense(trip.id, alice.id, "Hotel", Currency.ILS, [
        { owerId: alice.id, amountCents: 300_00 },
        { owerId: bob.id, amountCents: 300_00 },
        { owerId: carol.id, amountCents: 300_00 },
    ]);
    await createExpense(trip.id, bob.id, "Dinner", Currency.ILS, [
        { owerId: alice.id, amountCents: 80_00 },
        { owerId: bob.id, amountCents: 80_00 },
        { owerId: carol.id, amountCents: 80_00 },
    ]);
    // Carol isn't part of this one: not every expense is shared by the whole group.
    await createExpense(trip.id, alice.id, "Drinks", Currency.ILS, [
        { owerId: alice.id, amountCents: 50_00 },
        { owerId: bob.id, amountCents: 50_00 },
    ]);
    await createExpense(trip.id, carol.id, "Car rental", Currency.USD, [
        { owerId: alice.id, amountCents: 30_00 },
        { owerId: bob.id, amountCents: 30_00 },
        { owerId: carol.id, amountCents: 30_00 },
    ]);

    await prisma.settlement.createMany({
        data: [
            { groupId: trip.id, userFromId: carol.id, userToId: alice.id, amountCents: 300_00, currency: Currency.ILS },
            { groupId: trip.id, userFromId: bob.id, userToId: carol.id, amountCents: 30_00, currency: Currency.USD },
        ],
    });

    const flat = await createGroup("Flatmates", [bob.id, dave.id]);

    await createExpense(flat.id, dave.id, "Groceries", Currency.ILS, [
        { owerId: bob.id, amountCents: 60_00 },
        { owerId: dave.id, amountCents: 60_00 },
    ]);

    console.log("Seeding complete");
}

main()
    .catch((err) => {
        console.error("Seeding failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
    
