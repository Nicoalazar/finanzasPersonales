import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountDto, CategoryDto, MonthSummaryDto, TransactionDto, TransactionInput } from "@finanzas/shared";
import { api } from "./api";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<AccountDto[]>("/accounts") });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api<CategoryDto[]>("/categories") });
export const useTransactions = (month: string) =>
  useQuery({ queryKey: ["transactions", month], queryFn: () => api<{ items: TransactionDto[]; summary: MonthSummaryDto }>(`/transactions?month=${month}`) });

/** Ejecuta una mutación y refresca todo lo que depende de movimientos/cuentas/categorías. */
function useInvalidatingMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useCreateTransaction = () => useInvalidatingMutation((v: Partial<TransactionInput>) => api("/transactions", { method: "POST", json: v }));
export const useUpdateTransaction = () =>
  useInvalidatingMutation((v: { id: string; patch: Partial<TransactionDto> }) => api(`/transactions/${v.id}`, { method: "PATCH", json: v.patch }));
export const useDeleteTransaction = () => useInvalidatingMutation((id: string) => api(`/transactions/${id}`, { method: "DELETE" }));
export const useCreateAccount = () => useInvalidatingMutation((v: { name: string; kind: string; initialBalance: number }) => api("/accounts", { method: "POST", json: v }));
export const useCreateCategory = () => useInvalidatingMutation((v: { name: string; type: string }) => api("/categories", { method: "POST", json: v }));
export const useDeleteCategory = () => useInvalidatingMutation((id: string) => api(`/categories/${id}`, { method: "DELETE" }));
