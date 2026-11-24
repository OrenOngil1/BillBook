import { describe, it, expect, beforeEach } from "vitest";
import { calculateBalance, type GroupForBalances } from "./balances.js";
import { Currency } from "../generated/prisma/enums.js";

const group: GroupForBalances = {
    members: [{ id: 1, username: "alice" }, { id: 2, username: "bob" }, { id: 3, username: "carol" }],
    expenses: [],
    settlements: []
};

beforeEach(() => {
    group.expenses = [];
    group.settlements = [];
});

describe("calculateBalance", () => {
    it("returns the full shares for a single expense without any settlements", () => {
        group.expenses = [
            {
                payerId: 1,
                amountCents: 300_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 },
                    { owerId: 3, amountCents: 100_00 }
                ]
            }
        ];

        expect(calculateBalance(group, 1)).toEqual([
            { userId: 2, username: "bob", currency: Currency.ILS, amountCents: 100_00 },
            { userId: 3, username: "carol", currency: Currency.ILS, amountCents: 100_00 }
        ]);

        expect(calculateBalance(group, 2)).toEqual([
            { userId: 1, username: "alice", currency: Currency.ILS, amountCents: -100_00 }
        ]);
    });


    it("balances out between expenses", () => {
        group.expenses = [
            {
                payerId: 1,
                amountCents: 300_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 },
                    { owerId: 3, amountCents: 100_00 }
                ]
            },
            {
                payerId: 2,
                amountCents: 300_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 },
                    { owerId: 3, amountCents: 100_00 }
                ]
            },
            {
                payerId: 3,
                amountCents: 300_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 },
                    { owerId: 3, amountCents: 100_00 }
                ]
            }
        ];

        expect(calculateBalance(group, 1)).toEqual([]);
    });

    it("balances out between settlements", () => {
        group.expenses = [
            {
                payerId: 1,
                amountCents: 300_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 },
                    { owerId: 3, amountCents: 100_00 }
                ]
            }
        ];
        group.settlements = [
            { amountCents: 100_00, currency: Currency.ILS, userFromId: 2, userToId: 1 },
            { amountCents: 100_00, currency: Currency.ILS, userFromId: 3, userToId: 1 }
        ];

        expect(calculateBalance(group, 1)).toEqual([]);
    });

    it("returns the correct balance for a user with two expenses, with a member who has a share in one of them",
        () => {
            group.expenses = [
                {
                    payerId: 1,
                    amountCents: 300_00,
                    currency: Currency.ILS,
                    shares: [
                        { owerId: 1, amountCents: 100_00 },
                        { owerId: 2, amountCents: 100_00 },
                        { owerId: 3, amountCents: 100_00 }
                    ]
                },
                {
                    payerId: 1,
                    amountCents: 200_00,
                    currency: Currency.ILS,
                    shares: [
                        { owerId: 1, amountCents: 100_00 },
                        { owerId: 2, amountCents: 100_00 }
                    ]
                }
            ];

            expect(calculateBalance(group, 1)).toEqual([
                { userId: 2, username: "bob", currency: Currency.ILS, amountCents: 200_00 },
                { userId: 3, username: "carol", currency: Currency.ILS, amountCents: 100_00 }
            ]);
        }
    );

    it("keeps currencies separate", () => {
        group.expenses = [
            {
                payerId: 1,
                amountCents: 200_00,
                currency: Currency.ILS,
                shares: [
                    { owerId: 1, amountCents: 100_00 },
                    { owerId: 2, amountCents: 100_00 }
                ]
            },
            {
                payerId: 2,
                amountCents: 60_00,
                currency: Currency.USD,
                shares: [
                    { owerId: 1, amountCents: 30_00 },
                    { owerId: 2, amountCents: 30_00 }
                ]
            }
        ];

        const balances = calculateBalance(group, 1);
        expect(balances).toHaveLength(2);
        expect(balances).toEqual(expect.arrayContaining([
            { userId: 2, username: "bob", currency: Currency.ILS, amountCents: 100_00 },
            { userId: 2, username: "bob", currency: Currency.USD, amountCents: -30_00 }
        ]));
    });
});
