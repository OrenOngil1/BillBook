import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Currency, type GroupLedger, type GroupSummary, type Settlement, type Stored } from "../src/types";
import AppRouter from "../src/routes/AppRouter";
import { TEST_API_URL as API_URL, TEST_USER_ID } from "./env";

const ALICE = { id: TEST_USER_ID, username: "Alice" };
const BOB = { id: 2, username: "Bob" };
const GROUP = { id: 7, name: "Trip", createdAt: "2026-01-01T00:00:00.000Z" };
// Balances are from the current user's side: negative means Alice owes Bob.
const ALICE_OWES_BOB = { userId: BOB.id, username: BOB.username, currency: Currency.USD, amountCents: -500 };

const SUMMARIES: GroupSummary[] = [{ group: GROUP, balances: [ALICE_OWES_BOB] }];
const LEDGER: GroupLedger = {
    group: {
        ...GROUP,
        members: [ALICE, BOB],
        expenses: [{
            id: 1, createdAt: "2026-01-02T00:00:00.000Z", payerId: BOB.id, description: "Taxi",
            amountCents: 1000, currency: Currency.USD,
            shares: [{ owerId: ALICE.id, amountCents: 500 }, { owerId: BOB.id, amountCents: 500 }],
        }],
        settlements: [],
    },
    balances: [ALICE_OWES_BOB],
};

/** Fakes the backend at the fetch boundary, so apiClient and endpoints run for real. */
function stubBackend() {
    const ledger = structuredClone(LEDGER);

    function respond(route: string, body: string): Response {
        switch (route) {
            case `GET ${API_URL}/groups/`:
                return Response.json(SUMMARIES);
            case `GET ${API_URL}/groups/${GROUP.id}`:
                return Response.json(ledger);
            case `POST ${API_URL}/groups/${GROUP.id}/settlements`: {
                const settlement: Stored<Settlement> = {
                    id: 1,
                    createdAt: "2026-01-03T00:00:00.000Z",
                    ...(JSON.parse(body) as Settlement),
                };
                ledger.group.settlements.push(settlement);
                return Response.json(settlement, { status: 201 });
            }
            default:
                throw new Error(`Unexpected request: ${route}`);
        }
    }

    // apiClient always passes the URL and the JSON body as strings.
    // .then turns a throw from respond into a rejected fetch, like a network failure.
    const fetchMock = vi.fn<typeof fetch>((input, init) =>
        Promise.resolve().then(() => respond(`${init?.method ?? "GET"} ${input as string}`, init?.body as string)));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderAppAt(path: string) {
    window.history.pushState({}, "", path);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={queryClient}>
            <AppRouter />
        </QueryClientProvider>
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("group flow", () => {
    it("opens a group's page from the groups list", async () => {
        const user = userEvent.setup();
        stubBackend();
        renderAppAt("/");

        await user.click(await screen.findByRole("link", { name: new RegExp(`^${GROUP.name}`) }));

        expect(await screen.findByRole("heading", { level: 1, name: GROUP.name })).toBeInTheDocument();
    });

    it("records a settlement from the current user and shows it once the group reloads", async () => {
        const user = userEvent.setup();
        const fetchMock = stubBackend();
        renderAppAt(`/groups/${GROUP.id}`);

        const settleWith = await screen.findByRole("combobox", { name: /^settle with/i });
        expect(within(settleWith).getAllByRole("option").map((option) => option.textContent))
            .toEqual([BOB.username]);

        await user.selectOptions(settleWith, [BOB.username]);
        await user.type(screen.getByRole("spinbutton", { name: /^for/i }), "5");
        await user.selectOptions(screen.getByRole("combobox", { name: /^in/i }), [Currency.USD]);
        await user.click(screen.getByRole("button", { name: /settle up/i }));

        // Payer name left out on purpose: how the page should name the current user is undecided.
        expect(await screen.findByText(/has settled with Bob for 5\.00 USD$/)).toBeInTheDocument();

        const [, postInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST") ?? [];
        expect(JSON.parse(postInit?.body as string)).toEqual({
            userToId: BOB.id,
            amountCents: 500,
            currency: Currency.USD,
        });
        expect(postInit?.headers).toMatchObject({ "X-User-Id": String(ALICE.id) });
    });
});
