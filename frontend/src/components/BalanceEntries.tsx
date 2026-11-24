import type { Balance, ActiveUser } from "../types";

type BalanceEntriesProps = Readonly<{
    records: ActiveUser<Balance>[];
    limit?: number;
}>

export default function BalanceEntries({ records, limit = records.length }: BalanceEntriesProps) {
    return <ul aria-label="Balances">
        {records.slice(0, limit).map(({ userId, username, amountCents, currency }) => {
            const [prefix, infix] = amountCents > 0 ? 
                ["You are owed", "by"] : 
                ["You owe", "to"];
            const amount = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
                maximumFractionDigits: 2,
            }).format(Math.abs(amountCents / 100));
            const text = `${prefix} ${amount} ${infix} ${username}`;
            return <li key={`${userId}-${currency}`}>{text}</li>;
        })}
    </ul>;
}