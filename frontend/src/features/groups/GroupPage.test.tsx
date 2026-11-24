import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { groupsApi } from "../../api/endpoints";
import { Currency, type GroupLedger } from "../../types";
import { TEST_USER_ID } from "../../../tests/env";
import GroupPage from "./GroupPage";

vi.mock(import("../../api/endpoints"));

const GROUP_ID = 7;
// The viewer: balances are from their side, and forms leave them out of member pickers.
const ME = { id: TEST_USER_ID, username: "Me" };
const ALICE = { id: 2, username: "Alice" };
const BOB = { id: 3, username: "Bob" };

const LEDGER: GroupLedger = {
    group: {
        id: GROUP_ID,
        name: "Trip",
        createdAt: "2026-01-01T00:00:00.000Z",
        members: [ME, ALICE, BOB],
        expenses: [
            {
                id: 1, createdAt: "2026-01-04T00:00:00.000Z", payerId: ALICE.id,
                description: "Dinner", amountCents: 1200, currency: Currency.USD, shares: [],
            },
            {
                id: 2, createdAt: "2026-01-02T00:00:00.000Z", payerId: BOB.id,
                description: "Taxi", amountCents: 350, currency: Currency.USD, shares: [],
            },
        ],
        settlements: [
            {
                id: 1, createdAt: "2026-01-03T00:00:00.000Z", userFromId: BOB.id,
                userToId: ALICE.id, amountCents: 500, currency: Currency.USD,
            },
        ],
    },
    balances: [
        { userId: ALICE.id, username: ALICE.username, currency: Currency.USD, amountCents: 700 },
        { userId: BOB.id, username: BOB.username, currency: Currency.ILS, amountCents: -250 },
    ],
};

const ACTIVITY_OLDEST_FIRST = [
    "Bob paid 3.50 USD for Taxi",
    "Bob has settled with Alice for 5.00 USD",
    "Alice paid 12.00 USD for Dinner",
];

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[`/groups/${GROUP_ID}`]}>
                <Routes>
                    <Route path="/groups/:id" element={<GroupPage />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

const getBalanceList = () => screen.getByRole("list", { name: "Balances" });
const getActivityList = () => screen.getByRole("list", { name: "Activity" });

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(groupsApi.getById).mockResolvedValue(LEDGER);
});

describe("GroupPage", () => {
    it("renders the group name, balances, both forms and activity", async () => {
        renderPage();

        expect(await screen.findByRole("heading", { level: 1, name: LEDGER.group.name })).toBeInTheDocument();
        expect(groupsApi.getById).toHaveBeenCalledWith(GROUP_ID);

        expect(within(getBalanceList()).getAllByRole("listitem")).toHaveLength(LEDGER.balances.length);
        expect(within(getActivityList()).getAllByRole("listitem")).toHaveLength(ACTIVITY_OLDEST_FIRST.length);

        const settleWith = within(screen.getByRole("form", { name: /create settlement/i }))
            .getByRole("combobox", { name: /^settle with/i });
        expect(within(settleWith).getAllByRole("option").map((option) => option.textContent))
            .toEqual([ALICE.username, BOB.username]);

        // The payer's own share is computed, so the expense form only asks about the others.
        const shareInputs = within(screen.getByRole("group", { name: /how much does everyone pay/i }))
            .getAllByRole("spinbutton");
        expect(shareInputs.map((input) => input.closest("label")?.textContent))
            .toEqual([`${ALICE.username}:`, `${BOB.username}:`]);
    });

    it("lists expenses and settlements together, oldest first", async () => {
        renderPage();

        await screen.findByRole("heading", { level: 1, name: LEDGER.group.name });
        const items = within(getActivityList()).getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual(ACTIVITY_OLDEST_FIRST);
    });

    describe("with a soft-deleted member", () => {
        const deleted = { id: 4, username: null };
        const deletedBalance = { userId: deleted.id, username: null, currency: Currency.USD, amountCents: 100 };
        const aliceBalance = { userId: ALICE.id, username: ALICE.username, currency: Currency.USD, amountCents: 200 };

        function mockLedgerWithBalances(balances: GroupLedger["balances"]) {
            vi.mocked(groupsApi.getById).mockResolvedValue({
                group: {
                    ...LEDGER.group,
                    members: [ME, ALICE, deleted],
                    expenses: [],
                    settlements: [{
                        id: 1, createdAt: "2026-01-03T00:00:00.000Z", userFromId: deleted.id,
                        userToId: ALICE.id, amountCents: 500, currency: Currency.USD,
                    }],
                },
                balances,
            });
        }

        it("hides their balance but names them 'Deleted User' in activity", async () => {
            mockLedgerWithBalances([deletedBalance, aliceBalance]);
            renderPage();

            await screen.findByRole("heading", { level: 1, name: LEDGER.group.name });
            const balanceItems = within(getBalanceList()).getAllByRole("listitem");
            expect(balanceItems.map((item) => item.textContent)).toEqual(["You are owed $2.00 by Alice"]);
            expect(within(getActivityList()).getByRole("listitem"))
                .toHaveTextContent("Deleted User has settled with Alice for 5.00 USD");
        });

        it("hides the settlement form when they are the only one with a balance", async () => {
            mockLedgerWithBalances([deletedBalance]);
            renderPage();

            await screen.findByRole("heading", { level: 1, name: LEDGER.group.name });
            expect(screen.queryByRole("form", { name: /create settlement/i })).not.toBeInTheDocument();
        });
    });

    it("lists balances grouped by member name, keeping each member's currencies in API order", async () => {
        // Currency-major, as the backend sends it, with Bob ahead of Alice.
        vi.mocked(groupsApi.getById).mockResolvedValue({
            ...LEDGER,
            balances: [
                { userId: BOB.id, username: BOB.username, currency: Currency.USD, amountCents: 100 },
                { userId: ALICE.id, username: ALICE.username, currency: Currency.USD, amountCents: 200 },
                { userId: BOB.id, username: BOB.username, currency: Currency.ILS, amountCents: 300 },
                { userId: ALICE.id, username: ALICE.username, currency: Currency.ILS, amountCents: 400 },
            ],
        });
        renderPage();

        await screen.findByRole("heading", { level: 1, name: LEDGER.group.name });
        const items = within(getBalanceList()).getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual([
            "You are owed $2.00 by Alice",
            "You are owed ₪4.00 by Alice",
            "You are owed $1.00 by Bob",
            "You are owed ₪3.00 by Bob",
        ]);
    });
});
