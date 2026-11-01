import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountDto, CategoryDto, MonthSummaryDto, TransactionDto, TransactionInput } from "@finanzas/shared";
import { api } from "./api";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api<AccountDto[]>("/accounts") });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: () => api<CategoryDto[]>("/categories") });
export const useTransactions = (month: string, enabled = true) =>
  useQuery({ queryKey: ["transactions", month], enabled, queryFn: () => api<{ items: TransactionDto[]; summary: MonthSummaryDto }>(`/transactions?month=${month}`) });

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

// ---- Recurrentes y grupos ----
import type { RecurringDto, SharedGroupDto } from "@finanzas/shared";

export const useRecurring = (month: string) => useQuery({ queryKey: ["recurring", month], queryFn: () => api<RecurringDto[]>(`/recurring?month=${month}`) });
export const useSharedGroups = (month: string) => useQuery({ queryKey: ["shared-groups", month], queryFn: () => api<SharedGroupDto[]>(`/shared-groups?month=${month}`) });

/** Genera los pendientes del mes al abrirlo (idempotente) y refresca los movimientos si hubo cambios. */
export const useGenerateMonth = (month: string) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["generate", month],
    queryFn: async () => {
      const r = await api<{ created: number; updated: number }>("/recurring/generate", { method: "POST", json: { month } });
      if (r.created + r.updated > 0) await qc.invalidateQueries({ queryKey: ["transactions"] });
      return r;
    },
  });
};

export const useCreateRecurring = () => useInvalidatingMutation((v: unknown) => api("/recurring", { method: "POST", json: v }));
export const usePatchRecurring = () => useInvalidatingMutation((v: { id: string; patch: unknown }) => api(`/recurring/${v.id}`, { method: "PATCH", json: v.patch }));
export const useDeleteRecurring = () => useInvalidatingMutation((id: string) => api(`/recurring/${id}`, { method: "DELETE" }));
export const useSetPrice = () =>
  useInvalidatingMutation((v: { id: string; fromMonth: string; amount: number }) => api(`/recurring/${v.id}/prices`, { method: "PUT", json: { fromMonth: v.fromMonth, amount: v.amount } }));
export const useCreateGroup = () => useInvalidatingMutation((v: { name: string; myPercent: number }) => api("/shared-groups", { method: "POST", json: v }));
export const useSetGroupPercent = () =>
  useInvalidatingMutation((v: { id: string; month: string; percent: number }) => api(`/shared-groups/${v.id}/percent`, { method: "PUT", json: { month: v.month, percent: v.percent } }));
export const useClearGroupPercent = () =>
  useInvalidatingMutation((v: { id: string; month: string }) => api(`/shared-groups/${v.id}/percent/${v.month}`, { method: "DELETE" }));

// ---- Presupuestos ----
import type { BudgetsDto } from "@finanzas/shared";

export const useBudgets = (month: string) => useQuery({ queryKey: ["budgets", month], queryFn: () => api<BudgetsDto>(`/budgets?month=${month}`) });
export const useSetBudget = () =>
  useInvalidatingMutation((v: { categoryId: string; month: string; amount: number }) => api("/budgets", { method: "PUT", json: v }));
export const useDeleteBudget = () =>
  useInvalidatingMutation((v: { categoryId: string; month: string }) => api(`/budgets/${v.categoryId}/${v.month}`, { method: "DELETE" }));
export const useCopyBudgets = () =>
  useInvalidatingMutation((v: { fromMonth: string; toMonth: string; increasePercent: number; overwrite: boolean }) =>
    api<{ copied: number; skipped: number }>("/budgets/copy", { method: "POST", json: v }));

// ---- Sueldos ----
import type { PayslipDto, SacSuggestionDto } from "@finanzas/shared";

export const usePayslips = () => useQuery({ queryKey: ["payslips"], queryFn: () => api<PayslipDto[]>("/payslips") });
export const useSacSuggestion = (month: string, enabled: boolean) =>
  useQuery({ queryKey: ["sac-suggestion", month], enabled, queryFn: () => api<SacSuggestionDto>(`/payslips/sac-suggestion?month=${month}`) });
export const useCreatePayslip = () =>
  useInvalidatingMutation((v: { month: string; kind: string; gross: number; net: number; date: string; accountId: string; paid: boolean }) =>
    api("/payslips", { method: "POST", json: v }));
export const usePatchPayslip = () =>
  useInvalidatingMutation((v: { id: string; patch: { gross?: number; net?: number; date?: string } }) => api(`/payslips/${v.id}`, { method: "PATCH", json: v.patch }));
export const useDeletePayslip = () => useInvalidatingMutation((id: string) => api(`/payslips/${id}`, { method: "DELETE" }));

// ---- Inversiones ----
import type { InvestmentsDto } from "@finanzas/shared";

export const useInvestments = () => useQuery({ queryKey: ["investments"], queryFn: () => api<InvestmentsDto>("/investments") });
export const useAddSnapshot = () =>
  useInvalidatingMutation((v: { accountId: string; date: string; balance: number }) => api("/investments/snapshots", { method: "POST", json: v }));
export const useDeleteSnapshot = () => useInvalidatingMutation((id: string) => api(`/investments/snapshots/${id}`, { method: "DELETE" }));
export const useAddInvestmentMovement = () =>
  useInvalidatingMutation((v: { accountId: string; kind: "DEPOSIT" | "WITHDRAWAL"; otherAccountId: string; date: string; amount: number }) =>
    api("/investments/movements", { method: "POST", json: v }));

// ---- Dashboard ----
import type { DashboardDto } from "@finanzas/shared";

export const useDashboard = (month: string, months: number) =>
  useQuery({ queryKey: ["dashboard", month, months], queryFn: () => api<DashboardDto>(`/dashboard?month=${month}&months=${months}`) });
