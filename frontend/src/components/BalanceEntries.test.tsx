import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Balance, ActiveUser } from "../types";
import BalanceEntries from "./BalanceEntries";

const alice: ActiveUser<Balance> = { userId: 1, username: "Alice", currency: "ILS", amountCents: 1050 };
const bob: ActiveUser<Balance> = { userId: 2, username: "Bob", currency: "USD", amountCents: -500 };
const carol: ActiveUser<Balance> = { userId: 3, username: "Carol", currency: "EUR", amountCents: 25 };

describe("BalanceEntries", () => {
    it("tells the user they are owed money when the balance is positive", () => {
        render(<BalanceEntries records={[alice]} />);
        expect(screen.getByRole("listitem")).toHaveTextContent("You are owed ₪10.50 by Alice");
    });

    it("tells the user they owe money when the balance is negative, without a minus sign", () => {
        render(<BalanceEntries records={[bob]} />);
        expect(screen.getByRole("listitem")).toHaveTextContent("You owe $5.00 to Bob");
    });

    it("shows every record when no limit is given", () => {
        render(<BalanceEntries records={[alice, bob, carol]} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("shows only the first `limit` records", () => {
        render(<BalanceEntries records={[alice, bob, carol]} limit={2} />);
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent("Alice");
        expect(items[1]).toHaveTextContent("Bob");
    });
});
