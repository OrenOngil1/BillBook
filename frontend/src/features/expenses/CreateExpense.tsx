import type { SubmitEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CURRENCIES, isCurrency, type Expense, type Share } from "../../types";
import { groupsApi } from "../../api/endpoints";
import { DEV_USER_ID } from "../../api/client";

type CreateExpenseProps = Readonly<{
    groupId: number;
    members: { id: number, username: string }[];
}>;

/** Converts a decimal money string from the form into positive integer cents. */
export function parseCents(value: FormDataEntryValue | null, field: string): number {
    if (typeof value !== "string") {
        throw new Error(`Missing ${field}`);
    }
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) {
        throw new Error(`Invalid ${field} ${value}`);
    }
    return cents;
}

export function parseExpenseForm(formData: FormData): { expense: Omit<Expense, "payerId">, shares: Share[] } {
    const description = formData.get("desc");
    if (typeof description !== "string" || !description) {
        throw new Error("An expense must have a description");
    }

    const amountCents = parseCents(formData.get("amount"), "amount");

    const currency = formData.get('currency');
    if (typeof currency !== "string") {
        throw new Error("No currency provided");
    }
    if(!isCurrency(currency)) {
        throw new Error(`Unsupprted currency ${currency}`);
    }

    const shares: Share[] = [];
    for (const [key, value] of formData) {
        if (!key.startsWith("share-")) continue;
        const owerId = Number(key.slice("share-".length));
        if (!Number.isSafeInteger(owerId) || owerId <= 0) {
            throw new Error(`Invalid user id in share field ${key}`);
        }
        shares.push({ owerId, amountCents: parseCents(value, `share for user ${owerId}`) });
    }

    return {
        expense: { description, amountCents, currency },
        shares,
    };
}

export default function CreateExpense({ groupId, members }: CreateExpenseProps) {
    const queryClient = useQueryClient();
    const { mutate, error, isPending } = useMutation({
        mutationFn: (formData: FormData) => {
            const { expense, shares } = parseExpenseForm(formData);
            const payerShare = expense.amountCents - shares.reduce((acc, shr) => acc + shr.amountCents, 0);
            if (payerShare < 0) {
                throw new Error("You can't add a payment where you pay a negative amount");
            }
            return groupsApi.createExpense(groupId, {
                expense,
                shares: [...shares, { owerId: Number(DEV_USER_ID), amountCents: payerShare }],
            });
        },
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["group", groupId] })
    });

    // onSubmit, so the form is reset only after a success.
    function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        mutate(new FormData(form), { onSuccess: () => form.reset() });
    }

    return (
        <form aria-label="Create expense" onSubmit={handleSubmit}>
            {error && <p role="alert">{error.message}</p>}
            <label>
                Description
                <input type="text" name="desc" required />
            </label>
            <label>
                amount
                <input 
                type="number"
                name="amount"
                inputMode="decimal"
                min={0.01}
                step={0.01}
                required
            />
            </label>
            <label>
                Currency
                <select name="currency" required>
                    {CURRENCIES.map((currency) => 
                        <option key={currency} value={currency}>{currency}</option>)}
                </select>
            </label>
            <fieldset>
                <legend>How much does everyone pay?</legend>
                <ul>
                    {members.map(({ id, username }) =>
                        <li key={id}>
                            <label>
                                {`${username}:`}
                                <input
                                    type="number"
                                    name={`share-${id}`}
                                    inputMode="decimal"
                                    min={0.01}
                                    step={0.01}
                                    required
                                />
                            </label>
                        </li>)}
                </ul>
            </fieldset>
            <button type="submit" disabled={isPending}>Add expense</button>
        </form>
    );
} 