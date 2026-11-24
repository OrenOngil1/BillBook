import type { Expense, Settlement, Share, User } from "../generated/prisma/client.js";
import { Currency } from "../generated/prisma/enums.js";

type UserForBalance = Pick<User, "id" | "username">;
type ExpenseForBalance = (Pick<Expense, "payerId" | "amountCents" | "currency"> & {
    shares: Pick<Share, "owerId" | "amountCents">[];
});
type SettlementForBalance = Pick<Settlement, "userFromId" | "userToId" | "amountCents" | "currency">;

export type GroupForBalances = {
  members: UserForBalance[];
  expenses: ExpenseForBalance[];
  settlements: SettlementForBalance[];
};

function sumCents(acc: number, element: { amountCents: number } | undefined) {
    return (element?.amountCents ?? 0) + acc;
}

function calculateBalanceBetweenUserAndMember(
    userId: number,
    memberId: number,
    expensesByUser: ExpenseForBalance[],
    expensesByOthers:ExpenseForBalance[], 
    settlementsFromMember: SettlementForBalance[],
    settlementsToMember: SettlementForBalance[]
) {
    if (userId === memberId) {
        return 0;
    }
    
    // Non-null: every expense paid by someone else includes a share for the user
    const userShares = expensesByOthers
        .filter((exp) => exp.payerId === memberId)
        .map((exp) => exp.shares.find((share) => share.owerId === userId)!);
    const memberShares = expensesByUser.map((exp) => exp.shares.find((share) => share.owerId === memberId));
    
    const centsOwedToUserByMember = 
        memberShares.reduce(sumCents, 0)
        + settlementsToMember.reduce(sumCents, 0);

    const centsOwedToMemberByUser = 
        userShares.reduce(sumCents, 0)
        + settlementsFromMember.reduce(sumCents, 0);
    
    return centsOwedToUserByMember - centsOwedToMemberByUser;
}

/**
 * Calculates what `userId` is owed (positive) or owes (negative),
 * per currency and per group member.
 *
 * Precondition: `group.expenses` and `group.settlements` contain only records
 * involving `userId` (expenses they paid or have a share in, settlements they
 * sent or received). The GET /groups/:id query guarantees this in its `where` filters.
 */
export function calculateBalance(group: GroupForBalances, userId: number) {
    return Object.values(Currency).flatMap((currency) => {
        
        const expensesPerCurrency = group.expenses.filter((exp) => exp.currency === currency);
        const settlementsPerCurrency = group.settlements.filter((settlement) => settlement.currency === currency);
        
        const { expensesByUser = [], expensesByOthers = [] } = Object.groupBy(expensesPerCurrency,
            (exp) => exp.payerId === userId ? "expensesByUser" : "expensesByOthers"
        );
        
        const { settlementsToUser = [], settlementsFromUser = [] } = Object.groupBy(settlementsPerCurrency,
            (settlement) => settlement.userToId === userId ? "settlementsToUser" : "settlementsFromUser"
        );
        
        const balances = group.members.map(
            (member) => ({
                userId: member.id,
                username: member.username,
                currency,
                amountCents: calculateBalanceBetweenUserAndMember(
                    userId,
                    member.id,
                    expensesByUser,
                    expensesByOthers,
                    settlementsToUser.filter((settlement) => settlement.userFromId === member.id),
                    settlementsFromUser.filter((settlement) => settlement.userToId === member.id)
                )
            })
        );

        return balances.filter((row) => row.amountCents !== 0);
    });
}