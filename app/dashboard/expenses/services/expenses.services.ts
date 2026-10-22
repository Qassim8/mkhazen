import { serverFetch } from "@/lib/api-client";

export interface MyExpense {
  id: string;
  entryNumber: string;
  amount: number;
  currency: "USD" | "SDG";
  amountUsd: number;
  description: string | null;
  reference: string | null;
  expenseAccount: string;
  paymentMethod: "CASH" | "BANK";
  createdAt: string;
}

export interface MyExpensesResponse {
  data: MyExpense[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function getMyExpenses(params?: {
  page?: number;
  limit?: number;
}): Promise<MyExpensesResponse> {
  return serverFetch<MyExpensesResponse>("/api/accounting/expenses", {
    method: "GET",
    params: { page: params?.page ?? 1, limit: params?.limit ?? 20 },
  });
}
