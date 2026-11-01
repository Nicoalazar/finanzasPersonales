import { z } from "zod";

export const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().finite();

export const accountKind = z.enum(["CASH", "BANK", "WALLET", "INVESTMENT"]);
export const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: accountKind.default("BANK"),
  initialBalance: money.default(0),
});
export const accountPatch = accountInput.partial().extend({ archived: z.boolean().optional() });

export const categoryType = z.enum(["INCOME", "EXPENSE"]);
export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: categoryType,
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});
export const categoryPatch = categoryInput.partial();

export const txType = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);
export const txStatus = z.enum(["PENDING", "PAID"]);
export const transactionInput = z
  .object({
    date: isoDate,
    amount: money.positive(),
    type: txType,
    status: txStatus.default("PAID"),
    description: z.string().trim().max(200).default(""),
    categoryId: z.string().nullable().optional(),
    accountId: z.string().min(1),
    toAccountId: z.string().nullable().optional(),
  })
  .refine((t) => (t.type === "TRANSFER" ? !!t.toAccountId && t.toAccountId !== t.accountId : !t.toAccountId), {
    message: "Las transferencias requieren una cuenta destino distinta; el resto no la admite",
    path: ["toAccountId"],
  });
export const transactionPatch = z
  .object({
    date: isoDate,
    amount: money.positive(),
    type: txType,
    status: txStatus,
    description: z.string().trim().max(200),
    categoryId: z.string().nullable(),
    accountId: z.string().min(1),
    toAccountId: z.string().nullable(),
  })
  .partial();

export const transactionQuery = z.object({
  month: yearMonth,
  type: txType.optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  status: txStatus.optional(),
});

export type AccountInput = z.infer<typeof accountInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type TransactionInput = z.infer<typeof transactionInput>;

export interface AccountDto { id: string; name: string; kind: z.infer<typeof accountKind>; initialBalance: number; balance: number; archived: boolean }
export interface CategoryDto { id: string; name: string; type: z.infer<typeof categoryType>; parentId: string | null; color: string | null }
export interface TransactionDto {
  id: string; date: string; period: string; amount: number; type: z.infer<typeof txType>; status: z.infer<typeof txStatus>;
  description: string; categoryId: string | null; accountId: string; toAccountId: string | null;
}
export interface MonthSummaryDto { income: number; expense: number; balance: number }

// ---- Tarjetas ----
export const cardInput = z.object({
  name: z.string().trim().min(1).max(80),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  stampTaxRate: z.number().min(0).max(1).default(0.007),
  isThirdParty: z.boolean().default(false),
  payAccountId: z.string().nullable().optional(),
});
export const cardPatch = cardInput.partial();

export const personInput = z.object({ name: z.string().trim().min(1).max(80) });

export const shareMode = z.enum(["PERCENT", "AMOUNT"]);
export const shareInput = z.object({
  personId: z.string().min(1),
  mode: shareMode,
  value: z.number().positive(),
});
export const purchaseInput = z
  .object({
    cardId: z.string().min(1),
    date: isoDate,
    description: z.string().trim().min(1).max(200),
    categoryId: z.string().nullable().optional(),
    totalAmount: z.number().finite().positive(),
    installmentCount: z.number().int().min(1).max(60).default(1),
    firstStatementMonth: yearMonth.optional(),
    shares: z.array(shareInput).default([]),
  })
  .refine((p) => p.shares.every((s) => s.mode !== "PERCENT" || s.value <= 100), { message: "Un porcentaje no puede superar 100", path: ["shares"] })
  .refine(
    (p) => p.shares.filter((s) => s.mode === "PERCENT").reduce((a, s) => a + s.value, 0) <= 100,
    { message: "Los porcentajes repartidos superan 100", path: ["shares"] },
  );
export const statementQuery = z.object({ month: yearMonth });
export const statementPatch = z.object({ month: yearMonth, adjustment: z.number().finite().optional(), refunds: z.number().finite().min(0).optional() });
export const statementPay = z.object({ month: yearMonth, date: isoDate, accountId: z.string().optional() });

export type CardInput = z.infer<typeof cardInput>;
export type PurchaseInput = z.infer<typeof purchaseInput>;

export interface CardDto { id: string; name: string; closingDay: number; dueDay: number; stampTaxRate: number; isThirdParty: boolean; payAccountId: string | null }
export interface PersonDto { id: string; name: string }
export interface PurchaseDto {
  id: string; cardId: string; date: string; description: string; categoryId: string | null; totalAmount: number;
  installmentCount: number; firstStatementMonth: string; lastStatementMonth: string;
  shares: { personId: string; mode: "PERCENT" | "AMOUNT"; value: number }[];
}
export interface StatementItemDto {
  installmentId: string; purchaseId: string; description: string; number: number; count: number; amount: number;
  thirdParty: number; shares: { personId: string; name: string; amount: number }[];
}
export interface StatementDto {
  cardId: string; month: string; items: StatementItemDto[];
  subtotal: number; stampTax: number; adjustment: number; total: number;
  thirdParty: number; refunds: number; netOwn: number;
  byPerson: { personId: string; name: string; amount: number }[];
  paidAt: string | null;
}
export interface CommitmentDto { month: string; total: number; byCard: { cardId: string; total: number }[] }
