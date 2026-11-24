import type { CreatedExpense, CreatedGroup, Expense, GroupLedger, GroupSummary, Settlement, Share, Stored } from "../types";
import { apiClient } from "./client";

export const groupsApi = {
    getAll: () => apiClient<GroupSummary[]>(`groups/`),

    getById: (id: number) => apiClient<GroupLedger>(`groups/${id}`),

    create: (data: { name: string, userIds: number[] }) =>
        apiClient<CreatedGroup>(`groups/`, { method: "POST", body: data }),

    createExpense: (id: number, data: {
        expense: Omit<Expense, "payerId">,
        shares: Share[]
    }) => apiClient<CreatedExpense>(`groups/${id}/expenses`, { method: "POST", body: data }),

    createSettlement: (id: number, data: Omit<Settlement, "userFromId">) =>
        apiClient<Stored<Settlement>>(`groups/${id}/settlements`, { method: "POST", body: data })
}
