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
