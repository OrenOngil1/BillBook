import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { groupsApi } from "../../api/endpoints";
import { Currency } from "../../types";
import { ApiError } from "../../api/errors";
import CreateSettlement, { parseSettlementForm } from "./CreateSettelment";

vi.mock(import("../../api/endpoints"));

const GROUP_ID = 1;
// Everyone except the current user, who settles: GroupPage passes members this way.
const MEMBERS = [{ id: 2, username: "Bob" }, { id: 3, username: "Charlie" }];
const VALID_FIELDS = { "user to": "2", amount: "0.29", currency: Currency.ILS };

function formWith(fields: Partial<Record<keyof typeof VALID_FIELDS, string>>) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        formData.set(name, value);
    }
    return formData;
}

function renderWithContext() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false} }
    });
    render(
        <QueryClientProvider client={queryClient}>
            <CreateSettlement groupId={GROUP_ID} members={MEMBERS}/>
        </QueryClientProvider>
    );
    return { queryClient };
}

function getFields() {
    return {
        userTo: screen.getByRole("combobox", { name: /^settle with/i }),
        amount: screen.getByRole("spinbutton", { name: /^for/i }),
        currency: screen.getByRole("combobox", { name: /^in/i }),
        submit: screen.getByRole("button", { name: /settle up/i }),
    };
}

async function fillAndSubmit(user: UserEvent, { to, amount, currency }: { to: string, amount: string, currency: Currency }) {
    const fields = getFields();
    await user.selectOptions(fields.userTo, [to]);
    await user.type(fields.amount, amount);
    await user.selectOptions(fields.currency, [currency]);
    await user.click(fields.submit);
    return fields;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("parseSettlementForm", () => {
    it("parses valid fields, converting the amount to whole cents", () => {
        expect(parseSettlementForm(formWith(VALID_FIELDS))).toEqual({
            userToId: 2,
            amountCents: 29,
            currency: "ILS",
        });
    });

    it.each([
        ["no user", { "user to": undefined }],
        ["an empty user", { "user to": "" }],
        ["a non-numeric user", { "user to": "bob" }],
        ["a fractional user id", { "user to": "1.5" }],
        ["no amount", { amount: undefined }],
        ["an empty amount", { amount: "" }],
        ["a non-numeric amount", { amount: "abc" }],
        ["a zero amount", { amount: "0" }],
        ["a negative amount", { amount: "-1" }],
        ["an amount that rounds to zero cents", { amount: "0.004" }],
        ["no currency", { currency: undefined }],
        ["an unsupported currency", { currency: "GBP" }],
    ])("rejects %s", (_, overrides) => {
        const fields = Object.fromEntries(
            Object.entries({ ...VALID_FIELDS, ...overrides }).filter(([, value]) => value !== undefined),
        );

        expect(() => parseSettlementForm(formWith(fields))).toThrow();
    });
});


describe("create settlement form", () => {
    it("renders every component", () => {
        renderWithContext();

        const { userTo, amount, currency, submit } = getFields();
        expect(userTo).toBeInTheDocument();
        expect(amount).toBeInTheDocument();
        expect(currency).toBeInTheDocument();
        expect(submit).toHaveAttribute("type", "submit");
    });

    it("sends the amount in whole cents", async () => {
        const user = userEvent.setup();
        renderWithContext();

        await fillAndSubmit(user, { to: "Bob", amount: VALID_FIELDS.amount, currency: VALID_FIELDS.currency });

        await waitFor(() => {
            expect(groupsApi.createSettlement).toHaveBeenCalledWith(GROUP_ID, {
                userToId: 2,
                amountCents: 29,
                currency: Currency.ILS,
            });
        });
    });

    it("refreshes the group after a successful request", async () => {
        const user = userEvent.setup();
        const { queryClient } = renderWithContext();
        const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

        await fillAndSubmit(user, { to: "Charlie", amount: "42", currency: Currency.USD });

        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["group", GROUP_ID] });
        });
    });

    it("clears the form after a successful request", async () => {
        const user = userEvent.setup();
        renderWithContext();

        const { amount } = await fillAndSubmit(user, { to: "Charlie", amount: "42", currency: Currency.USD });

        await waitFor(() => {
            expect(amount).toHaveValue(null);
        });
    });

    it("shows the error and keeps every field after a failed request", async () => {
        const user = userEvent.setup();
        const message = "You must choose a user from this group";
        vi.mocked(groupsApi.createSettlement).mockRejectedValue(new ApiError(422, message));
        renderWithContext();

        const { userTo, amount, currency } = await fillAndSubmit(user, { to: "Charlie", amount: "42", currency: Currency.USD });

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
        // Checked by role again, not via the old references: those would still hold
        // their values even if the form had been unmounted.
        expect(getFields().amount).toBe(amount);
        expect(userTo).toHaveDisplayValue(["Charlie"]);
        expect(amount).toHaveValue(42);
        expect(currency).toHaveValue(Currency.USD);
    });
});
