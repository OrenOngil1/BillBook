import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { groupsApi } from "../../api/endpoints";
import { ApiError } from "../../api/errors";
import { Currency, type GroupSummary } from "../../types";
import GroupsPage from "./GroupsPage";

vi.mock(import("../../api/endpoints"));

const GROUP_SUMMARIES: GroupSummary[] = [
    {
        group: { id: 1, name: "Trip", createdAt: "2026-01-01T00:00:00.000Z" },
        balances: [{ userId: 2, username: "Bob", currency: Currency.USD, amountCents: 500 }],
    },
    {
        group: { id: 2, name: "Flat", createdAt: "2026-01-02T00:00:00.000Z" },
        balances: [{ userId: 3, username: "Carol", currency: Currency.ILS, amountCents: -1050 }],
    },
];

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <GroupsPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("GroupsPage", () => {
    it("renders a card with name, link and balances for every group", async () => {
        vi.mocked(groupsApi.getAll).mockResolvedValue(GROUP_SUMMARIES);
        renderPage();

        expect(await screen.findByRole("heading", { level: 1, name: "Groups" })).toBeInTheDocument();
        const cards = screen.getAllByRole("article");
        expect(cards).toHaveLength(GROUP_SUMMARIES.length);

        GROUP_SUMMARIES.forEach(({ group, balances }) => {
            // The whole card is the link, so its accessible name starts with the group name.
            const link = screen.getByRole("link", { name: new RegExp(`^${group.name}`) });
            expect(link).toHaveAttribute("href", `/groups/${group.id}`);
            const card = within(link);
            expect(card.getByRole("heading", { level: 2, name: group.name })).toBeInTheDocument();
            expect(card.getAllByRole("listitem")).toHaveLength(balances.length);
        });
    });

    it("hides soft-deleted members' balances without losing a slot of the 3-balance preview", async () => {
        const balance = (userId: number, username: string | null) =>
            ({ userId, username, currency: Currency.USD, amountCents: 100 });
        vi.mocked(groupsApi.getAll).mockResolvedValue([{
            group: GROUP_SUMMARIES[0].group,
            balances: [balance(9, null), balance(2, "Bob"), balance(3, "Carol"), balance(4, "Dan")],
        }]);
        renderPage();

        const card = within(await screen.findByRole("article"));
        expect(card.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
            "You are owed $1.00 by Bob",
            "You are owed $1.00 by Carol",
            "You are owed $1.00 by Dan",
        ]);
    });

    it("shows the error message when fetching groups fails", async () => {
        const message = "Could not load groups";
        vi.mocked(groupsApi.getAll).mockRejectedValue(new ApiError(500, message));
        renderPage();

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Groups" })).not.toBeInTheDocument();
    });
});
