import type { SubmitEvent } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { groupsApi } from "../../api/endpoints";
import { CURRENCIES, isCurrency, type Settlement } from "../../types";

type CreateSettlementProps = Readonly<{
    groupId: number;
    members: { id: number, username: string }[];
}>;

/** Reads the settlement form's fields, throwing if any is missing or invalid. */
export function parseSettlementForm(formData: FormData): Omit<Settlement, "userFromId"> {
    const userTo = formData.get('user to');
    if (typeof userTo !== "string") {
        throw new Error("No user to settle with");
    }
    const userToId = Number(userTo);
    if (!Number.isSafeInteger(userToId) || userToId <= 0) {
        throw new Error(`Invalid user to settle with ${userTo}`);
    }

    const amount = formData.get('amount');
    if (typeof amount !== "string") {
        throw new Error("no amount to settle");
    }
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new Error(`Invalid amount ${amount}`);
    }

    const currency = formData.get('currency');
    if (typeof currency !== "string") {
        throw new Error("No currency provided");
    }
    if(!isCurrency(currency)) {
        throw new Error(`Unsupprted currency ${currency}`);
    }

    return { userToId, amountCents, currency };
}

export default function CreateSettlement({ groupId,  members }: CreateSettlementProps) {
    const queryClient = useQueryClient();
    const { mutate, error, isPending } = useMutation({
        mutationFn: (formData: FormData) => groupsApi.createSettlement(groupId, parseSettlementForm(formData)),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["group", groupId] })
    });

    // onSubmit, so the form is reset only after a success.
    function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        mutate(new FormData(form), { onSuccess: () => form.reset() });
    }

    return <form aria-label="Create settlement" onSubmit={handleSubmit}>
        {error && <p role="alert">{error.message}</p>}
        <label>
            Settle with:
            <select name="user to" required>
                {members.map(({ id, username }) => 
                    <option key={id} value={id}>{username}</option>)}
            </select>
        </label>
        <label>
            for:
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
            in:
            <select name="currency" required>
                {CURRENCIES.map((currency) => 
                    <option key={currency} value={currency}>{currency}</option>)}
            </select>
        </label>
        <button type="submit" disabled={isPending}>Settle up</button>
    </form>
}