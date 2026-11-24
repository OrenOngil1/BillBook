import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { groupsApi } from "../../api/endpoints";
import { Currency } from "../../types";
import { ApiError } from "../../api/errors";
import { TEST_USER_ID } from "../../../tests/env";
import CreateExpense, { parseExpenseForm } from "./CreateExpense";

vi.mock(import("../../api/endpoints"));

const GROUP_ID = 1;
// Everyone except the current user, who pays: GroupPage passes members this way.
const MEMBERS = [{ id: 2, username: "Bob" }, { id: 3, username: "Charlie" }];
const VALID_FIELDS: Record<string, string> = {
    desc: "Dinner",
    amount: "30.5",
    currency: Currency.ILS,
    "share-2": "10.25",
    "share-3": "20.25",
};

function formWith(fields: Record<string, string | undefined>) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        if (value !== undefined) formData.set(name, value);
    }
    return formData;
}

function renderWithContext() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    });
    render(
        <QueryClientProvider client={queryClient}>
            <CreateExpense groupId={GROUP_ID} members={MEMBERS} />
        </QueryClientProvider>
    );
    return { queryClient };
}

function getFields() {
    const shares = within(screen.getByRole("group", { name: /how much does everyone pay/i }));
    return {
        description: screen.getByRole("textbox", { name: /^description/i }),
        amount: screen.getByRole("spinbutton", { name: /^amount/i }),
        currency: screen.getByRole("combobox", { name: /^currency/i }),
        shares: MEMBERS.map(({ username }) =>
            shares.getByRole("spinbutton", { name: new RegExp(`^${username}`, "i") })),
        submit: screen.getByRole("button", { name: /add expense/i }),
    };
}

/** Fills a 30 USD dinner with `share` for each other member, leaving the rest to the payer, then submits. */
async function fillAndSubmit(user: UserEvent, share = "10") {
    const fields = getFields();
    await user.type(fields.description, "Dinner");
    await user.type(fields.amount, "30");
    await user.selectOptions(fields.currency, [Currency.USD]);
    for (const input of fields.shares) {
        await user.type(input, share);
    }
    await user.click(fields.submit);
    return fields;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("parseExpenseForm", () => {
    it("parses valid fields, converting amounts to whole cents and keying shares by user id", () => {
        expect(parseExpenseForm(formWith(VALID_FIELDS))).toEqual({
            expense: {
                description: "Dinner",
                amountCents: 3050,
                currency: Currency.ILS,
            },
            shares: [
                { owerId: 2, amountCents: 1025 },
                { owerId: 3, amountCents: 2025 },
            ],
        });
    });

    it.each([
        ["no description", { desc: undefined }],
        ["an empty description", { desc: "" }],
        ["no amount", { amount: undefined }],
        ["an empty amount", { amount: "" }],
        ["a non-numeric amount", { amount: "abc" }],
        ["a zero amount", { amount: "0" }],
        ["a negative amount", { amount: "-1" }],
        ["an amount that rounds to zero cents", { amount: "0.004" }],
        ["no currency", { currency: undefined }],
        ["an unsupported currency", { currency: "GBP" }],
        ["an empty share", { "share-2": "" }],
        ["a non-numeric share", { "share-2": "abc" }],
        ["a zero share", { "share-2": "0" }],
        ["a negative share", { "share-2": "-1" }],
        ["a share with no user id", { "share-": "10" }],
        ["a share with a non-numeric user id", { "share-abc": "10" }],
    ])("rejects %s", (_, overrides) => {
        expect(() => parseExpenseForm(formWith({ ...VALID_FIELDS, ...overrides }))).toThrow();
    });
});

describe("create expense form", () => {
    it("renders every field, with one share input per member", () => {
        renderWithContext();

        const { description, amount, currency, shares, submit } = getFields();
        expect(description).toBeInTheDocument();
        expect(amount).toBeInTheDocument();
        expect(currency).toBeInTheDocument();
        expect(shares).toHaveLength(MEMBERS.length);
        expect(submit).toHaveAttribute("type", "submit");
    });

    it("sends amounts in whole cents, giving the payer whatever the others don't cover", async () => {
        const user = userEvent.setup();
        renderWithContext();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(groupsApi.createExpense).toHaveBeenCalledWith(GROUP_ID, {
                expense: {
                    description: "Dinner",
                    amountCents: 3000,
                    currency: Currency.USD,
                },
                shares: [
                    { owerId: 2, amountCents: 1000 },
                    { owerId: 3, amountCents: 1000 },
                    { owerId: TEST_USER_ID, amountCents: 1000 },
                ],
            });
        });
    });

    it("refuses shares that add up to more than the amount, without sending anything", async () => {
        const user = userEvent.setup();
        renderWithContext();

        await fillAndSubmit(user, "20");

        expect(await screen.findByRole("alert")).toHaveTextContent("You can't add a payment where you pay a negative amount");
        expect(groupsApi.createExpense).not.toHaveBeenCalled();
    });

    it("refreshes the group after a successful request", async () => {
        const user = userEvent.setup();
        const { queryClient } = renderWithContext();
        const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["group", GROUP_ID] });
        });
    });

    it("clears the form after a successful request", async () => {
        const user = userEvent.setup();
        renderWithContext();

        const { description } = await fillAndSubmit(user);

        await waitFor(() => {
            expect(description).toHaveValue("");
        });
    });

    it("shows the error and keeps every field after a failed request", async () => {
        const user = userEvent.setup();
        const message = "Shares must add up to the expense amount";
        vi.mocked(groupsApi.createExpense).mockRejectedValue(new ApiError(422, message));
        renderWithContext();

        const { description, amount, currency, shares } = await fillAndSubmit(user);

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
        // Checked by role again, not via the old references: those would still hold
        // their values even if the form had been unmounted.
        expect(getFields().description).toBe(description);
        expect(description).toHaveValue("Dinner");
        expect(amount).toHaveValue(30);
        expect(currency).toHaveValue(Currency.USD);
        for (const share of shares) {
            expect(share).toHaveValue(10);
        }
    });
});
