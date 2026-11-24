export const Currency = {
  USD: "USD",
  EUR: "EUR",
  ILS: "ILS"
} as const
export type Currency = (typeof Currency)[keyof typeof Currency];
export const CURRENCIES = Object.values(Currency) as readonly string[];
export const isCurrency = (x: unknown): x is Currency => 
    typeof x === "string" && CURRENCIES.includes(x);

export type Expense = {
    payerId: number;
    description: string; 
    amountCents: number; 
    currency: Currency;
};

export type Share = {
    amountCents: number;
    owerId: number;
};

export type Settlement = {
    amountCents: number;
    currency: Currency;
    userToId: number;
    userFromId: number;  
};

export type Stored<T> = T & { id: number; createdAt: string };

export type Member = { id: number; username: string | null };

export type Group = Stored<{ name: string }>;

export type GroupDetails = Group & {
    members: Member[];
    expenses: (Stored<Expense> & { shares: Share[] })[];
    settlements: Stored<Settlement>[];
};

export type CreatedGroup = Group & { members: Member[] };

export type CreatedExpense = Stored<Expense> & { shares: Stored<Share>[] };

// Soft-deleted users keep their rows but lose their username (null in the API).
export const DELETED_USER = "Deleted User";

export type Balance = {
    userId: number;
    username: string | null;
    currency: Currency;
    amountCents: number;
};

// Narrows away soft-deleted users, e.g. to hide their balances or keep them out of pickers.
export type ActiveUser<T extends { username: string | null }> = T & { username: string };
export const isActiveUser = <T extends { username: string | null }>(item: T): item is ActiveUser<T> =>
    item.username !== null;

export type GroupSummary = {
    group: Group,
    balances: Balance[]
};

export type GroupLedger = {
    group: GroupDetails,
    balances: Balance[]
};