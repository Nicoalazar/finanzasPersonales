import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountDto, CategoryDto, MonthSummaryDto, TransactionDto, TransactionInput } from "@finanzas/shared";
import { api } from "./api";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<AccountDto[]>("/accounts") });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api<CategoryDto[]>("/categories") });
export const useTransactions = (month: string) =>
  useQuery({ queryKey: ["transactions", month], queryFn: () => api<{ items: TransactionDto[]; summary: MonthSummaryDto }>(`/transactions?month=${month}`) });

/** Ejecuta una mutación y refresca todo lo que depende de movimientos/cuentas/categorías. */
function useInvalidatingMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
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

// ---- Tarjetas ----
import type { CardDto, CommitmentDto, PersonDto, PurchaseInput, StatementDto } from "@finanzas/shared";

export const useCards = () => useQuery({ queryKey: ["cards"], queryFn: () => api<CardDto[]>("/cards") });
export const usePersons = () => useQuery({ queryKey: ["persons"], queryFn: () => api<PersonDto[]>("/persons") });
export const useStatement = (cardId: string | undefined, month: string) =>
  useQuery({ queryKey: ["statement", cardId, month], enabled: !!cardId, queryFn: () => api<StatementDto>(`/cards/${cardId}/statement?month=${month}`) });
export const useCommitments = (from: string) =>
  useQuery({ queryKey: ["commitments", from], queryFn: () => api<CommitmentDto[]>(`/cards/commitments?from=${from}&months=12`) });

export const useCreateCard = () =>
  useInvalidatingMutation((v: { name: string; closingDay: number; dueDay: number }) => api("/cards", { method: "POST", json: v }));
export const useCreatePerson = () => useInvalidatingMutation<string, PersonDto>((name: string) => api<PersonDto>("/persons", { method: "POST", json: { name } }));
export const useCreatePurchase = () => useInvalidatingMutation((v: Partial<PurchaseInput>) => api("/card-purchases", { method: "POST", json: v }));
export const useDeletePurchase = () => useInvalidatingMutation((id: string) => api(`/card-purchases/${id}`, { method: "DELETE" }));
export const usePatchStatement = (cardId: string) =>
  useInvalidatingMutation((v: { month: string; adjustment?: number; refunds?: number }) => api(`/cards/${cardId}/statement`, { method: "PATCH", json: v }));
export const usePayStatement = (cardId: string) =>
  useInvalidatingMutation((v: { month: string; date: string; accountId?: string }) => api(`/cards/${cardId}/statement/pay`, { method: "POST", json: v }));
export const useUnpayStatement = (cardId: string) =>
  useInvalidatingMutation((month: string) => api(`/cards/${cardId}/statement/pay?month=${month}`, { method: "DELETE" }));

// ---- Personas ----
import type { PersonDetailDto, PersonSummaryDto } from "@finanzas/shared";

export const usePersonsSummary = () => useQuery({ queryKey: ["persons-summary"], queryFn: () => api<PersonSummaryDto[]>("/persons/summary") });
export const usePersonDetail = (id: string | undefined) =>
  useQuery({ queryKey: ["person", id], enabled: !!id, queryFn: () => api<PersonDetailDto>(`/persons/${id}`) });
export const useAddPayment = (personId: string) =>
  useInvalidatingMutation((v: { date: string; amount: number; accountId: string; note: string }) => api(`/persons/${personId}/payments`, { method: "POST", json: v }));
export const useDeletePayment = (personId: string) =>
  useInvalidatingMutation((id: string) => api(`/persons/${personId}/payments/${id}`, { method: "DELETE" }));
export const useAddCharge = (personId: string) =>
  useInvalidatingMutation((v: { description: string; totalAmount: number; installmentCount: number; firstMonth: string }) =>
    api(`/persons/${personId}/charges`, { method: "POST", json: v }));
export const useDeleteCharge = (personId: string) =>
  useInvalidatingMutation((id: string) => api(`/persons/${personId}/charges/${id}`, { method: "DELETE" }));

// ---- Fechas de tarjeta ----
export const useFirstMonth = (cardId: string, date: string) =>
  useQuery({ queryKey: ["first-month", cardId, date], enabled: !!date, queryFn: () => api<{ month: string }>(`/cards/${cardId}/first-month?date=${date}`) });
export const useMovePurchase = () =>
  useInvalidatingMutation((v: { id: string; firstStatementMonth: string }) => api(`/card-purchases/${v.id}`, { method: "PATCH", json: { firstStatementMonth: v.firstStatementMonth } }));
