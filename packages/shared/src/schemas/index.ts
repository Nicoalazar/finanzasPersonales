import { z } from "zod";
import type { Currency } from "../domain/cardStatement.js";

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
  description: string; categoryId: string | null; accountId: string; toAccountId: string | null; recurringId: string | null;
  /** Pago mío de un gasto compartido (se edita desde Compartidos) y saldo del mes con la pareja. */
  sharedExpenseId: string | null; sharedMonth: string | null;
}
/** income no incluye reintegros; netExpense = expense − reimbursements; balance = income − netExpense. */
export interface MonthSummaryDto { income: number; expense: number; reimbursements: number; netExpense: number; balance: number }

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
export const currency = z.enum(["ARS", "USD"]);
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
    /** Con USD, `totalAmount` va en dólares y se convierte en el resumen. */
    currency: currency.default("ARS"),
    /** Cotización oficial al cargar; si falta en una compra USD, el servidor la resuelve (API o último resumen). */
    usdRateEstimate: z.number().finite().positive().optional(),
  })
  .refine((p) => p.shares.every((s) => s.mode !== "PERCENT" || s.value <= 100), { message: "Un porcentaje no puede superar 100", path: ["shares"] })
  .refine(
    (p) => p.shares.filter((s) => s.mode === "PERCENT").reduce((a, s) => a + s.value, 0) <= 100,
    { message: "Los porcentajes repartidos superan 100", path: ["shares"] },
  )
  .refine((p) => p.currency !== "USD" || p.installmentCount === 1, { message: "Las compras en USD son en un solo pago", path: ["installmentCount"] })
  .refine(
    (p) => p.currency !== "USD" || p.shares.length === 0 || (p.shares.length === 1 && p.shares[0]!.mode === "PERCENT" && p.shares[0]!.value === 100),
    { message: "Una compra en USD es mía o de una sola persona al 100%", path: ["shares"] },
  );
export const statementQuery = z.object({ month: yearMonth });
export const statementPatch = z.object({
  month: yearMonth,
  adjustment: z.number().finite().optional(),
  /** Cotización real del resumen (la del PDF del banco); null la borra. */
  usdRate: z.number().finite().positive().nullable().optional(),
  refunds: z.number().finite().min(0).optional(),
  /** null vuelve al día por defecto de la tarjeta */
  closingDate: isoDate.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});
export const purchasePatch = z.object({ firstStatementMonth: yearMonth });
export const statementPay = z.object({ month: yearMonth, date: isoDate, accountId: z.string().optional() });

export type CardInput = z.infer<typeof cardInput>;
export type PurchaseInput = z.infer<typeof purchaseInput>;

export interface CardDto { id: string; name: string; closingDay: number; dueDay: number; stampTaxRate: number; isThirdParty: boolean; payAccountId: string | null }
/** Cotización sugerida para una compra USD: de la API, del último resumen de la tarjeta o ninguna (se carga a mano). */
export interface FxQuoteDto { rate: number | null; source: "api" | "statement" | null; asOf: string | null }
export interface PersonDto { id: string; name: string }
export interface PurchaseDto {
  id: string; cardId: string; date: string; description: string; categoryId: string | null; totalAmount: number;
  installmentCount: number; firstStatementMonth: string; lastStatementMonth: string;
  /** totalAmount está en esta moneda; usdRateEstimate solo existe en compras USD. */
  currency: Currency; usdRateEstimate: number | null;
  shares: { personId: string; mode: "PERCENT" | "AMOUNT"; value: number }[];
  /** Generada desde un gasto compartido: se edita desde Compartidos. */
  shared: boolean;
}
export interface StatementItemDto {
  installmentId: string; purchaseId: string; description: string; number: number; count: number;
  /** Siempre en pesos (convertido si la compra es USD). */
  amount: number;
  /** Monto original y cotización aplicada; solo en compras USD. */
  usdAmount: number | null; rate: number | null;
  thirdParty: number; shares: { personId: string; name: string; amount: number }[];
}
export interface StatementDto {
  cardId: string; month: string; items: StatementItemDto[];
  subtotal: number; stampTax: number; adjustment: number; total: number;
  /** Consumos USD del resumen: dólares, su equivalente en pesos y la cotización real (null hasta cargarla). */
  usdSubtotal: number; usdSubtotalArs: number; usdRate: number | null;
  /** true si hay consumos USD y todavía no hay cotización real: los pesos son una estimación. */
  usdEstimated: boolean;
  thirdParty: number; refunds: number; netOwn: number;
  byPerson: { personId: string; name: string; amount: number }[];
  paidAt: string | null;
  closingDate: string; dueDate: string; closingIsCustom: boolean; dueIsCustom: boolean;
}
/** total y byCard.total son el neto propio de cada resumen (total − terceros − reintegros). */
export interface CommitmentDto { month: string; total: number; byCard: { cardId: string; total: number }[] }

// ---- Personas ----
/** IN: la persona me paga (ingreso en Reintegros). OUT: yo le pago lo que le debo (sale de mi cuenta). */
export const paymentDirection = z.enum(["IN", "OUT"]);
/** THEY_OWE: me debe. I_OWE: pagó algo por mí y le debo (es un gasto mío, va a su categoría). */
export const debtDirection = z.enum(["THEY_OWE", "I_OWE"]);
export const personPaymentInput = z.object({
  direction: paymentDirection.default("IN"),
  date: isoDate,
  amount: z.number().finite().positive(),
  accountId: z.string().min(1),
  note: z.string().trim().max(200).default(""),
});
export const personChargeInput = z.object({
  direction: debtDirection.default("THEY_OWE"),
  /** solo para I_OWE: categoría de gasto donde cuenta */
  categoryId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1).max(200),
  totalAmount: z.number().finite().positive(),
  installmentCount: z.number().int().min(1).max(60).default(1),
  firstMonth: yearMonth,
});
export const asOfQuery = z.object({ asOf: yearMonth.optional() });

export interface PersonSummaryDto {
  personId: string; name: string;
  /** neto devengado: lo que me debe − lo que le debo */ accrued: number;
  /** neto pagado: lo que me pagó − lo que le pagué */ paid: number;
  /** accrued − paid: positivo, me debe; negativo, le debo (hasta el mes consultado) */ balance: number;
  upcoming: number; /** cuotas de meses posteriores */
}
export interface PersonLineDto {
  /** DEBT: pagó algo por mí; su amount es negativo (le debo) */
  kind: "CARD" | "CHARGE" | "RECURRING" | "DEBT"; refId: string; description: string; source: string; number: number; count: number; amount: number;
  /** Consumo en USD cuyo monto en pesos todavía usa la cotización estimada. */
  estimated?: boolean;
}
export interface PersonMonthDto { month: string; total: number; lines: PersonLineDto[] }
export interface PersonPaymentDto { id: string; direction: z.infer<typeof paymentDirection>; date: string; amount: number; note: string; accountId: string | null }
export interface PersonDetailDto extends PersonSummaryDto { months: PersonMonthDto[]; payments: PersonPaymentDto[] }

// ---- Recurrentes y grupos compartidos ----
export const frequency = z.enum(["MONTHLY", "BIMONTHLY", "YEARLY"]);
const percent = z.number().finite().min(0).max(100);

export const recurringInput = z.object({
  name: z.string().trim().min(1).max(80),
  categoryId: z.string().nullable().optional(),
  frequency: frequency.default("MONTHLY"),
  accountId: z.string().min(1),
  sharedGroupId: z.string().nullable().optional(),
  startMonth: yearMonth,
  endMonth: yearMonth.nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  /** precio inicial, vigente desde startMonth */
  amount: z.number().finite().positive(),
  shares: z.array(shareInput).default([]),
});
export const recurringPatch = recurringInput.omit({ amount: true }).partial();
export const recurringPriceInput = z.object({ fromMonth: yearMonth, amount: z.number().finite().positive() });
export const generateInput = z.object({ month: yearMonth });
export const recurringListQuery = z.object({ month: yearMonth.optional() });

export const sharedGroupInput = z.object({ name: z.string().trim().min(1).max(80), myPercent: percent, personId: z.string().nullable().optional() });
export const sharedGroupPercentInput = z.object({ month: yearMonth, percent });

export interface RecurringDto {
  id: string; name: string; categoryId: string | null; frequency: z.infer<typeof frequency>; accountId: string | null;
  sharedGroupId: string | null; startMonth: string; endMonth: string | null; dayOfMonth: number;
  prices: { fromMonth: string; amount: number }[];
  shares: { personId: string; mode: "PERCENT" | "AMOUNT"; value: number }[];
  /** en el mes consultado: myAmount es lo que sale de mi cuenta; owedAmount, lo que me debe la persona del grupo */
  occursThisMonth: boolean; price: number; groupPercent: number | null; myAmount: number; owedAmount: number;
}
export interface SharedGroupDto {
  id: string; name: string; myPercent: number;
  /** Con quién se comparte: me debe lo que no es mi % de lo recurrente del grupo. */
  personId: string | null;
  overrides: { month: string; percent: number }[];
  /** % efectivo en el mes consultado y si es propio de ese mes */
  percent: number; percentIsOwn: boolean;
}

// ---- Presupuestos ----
export const budgetStatusEnum = z.enum(["NONE", "OK", "WARN", "OVER"]);
export const budgetInput = z.object({ categoryId: z.string().min(1), month: yearMonth, amount: z.number().finite().min(0) });
export const budgetCopyInput = z
  .object({
    fromMonth: yearMonth,
    toMonth: yearMonth,
    increasePercent: z.number().finite().min(-100).max(1000).default(0),
    overwrite: z.boolean().default(false),
  })
  .refine((c) => c.fromMonth !== c.toMonth, { message: "Los meses tienen que ser distintos", path: ["toMonth"] });
export const budgetQuery = z.object({ month: yearMonth });

export interface BudgetRowDto {
  /** null = movimientos sin categoría (no se les puede fijar presupuesto) */
  categoryId: string | null; name: string;
  budget: number | null; spent: number; remaining: number | null;
  pct: number | null; status: z.infer<typeof budgetStatusEnum>;
}
export interface BudgetsDto {
  month: string; rows: BudgetRowDto[];
  totals: { budget: number; spentInBudgeted: number; spentTotal: number; pct: number | null; status: z.infer<typeof budgetStatusEnum>; warn: number; over: number };
}

// ---- Sueldos (solo bruto y neto) ----
/** Trabajo del que se cobra sueldo. informal = en negro: solo neto, sin bruto. */
export const jobInput = z.object({
  name: z.string().trim().min(1).max(60),
  informal: z.boolean().default(false),
  accountId: z.string().min(1).nullable().optional(),
});
export const jobPatch = z.object({
  name: z.string().trim().min(1).max(60),
  informal: z.boolean(),
  accountId: z.string().min(1).nullable(),
  archived: z.boolean(),
}).partial();
export interface JobDto { id: string; name: string; informal: boolean; accountId: string | null; archived: boolean; payslipCount: number }

export const payslipKind = z.enum(["MONTHLY", "SAC"]);
export const payslipInput = z.object({
  jobId: z.string().min(1),
  month: yearMonth,
  kind: payslipKind.default("MONTHLY"),
  /** obligatorio salvo en trabajos en negro, donde se ignora */
  gross: z.number().finite().positive().optional(),
  net: z.number().finite().positive(),
  /** fecha en que se cobra: define en qué mes entra el ingreso */
  date: isoDate,
  accountId: z.string().min(1),
  paid: z.boolean().default(true),
});
export const payslipPatch = z.object({
  gross: z.number().finite().positive(),
  net: z.number().finite().positive(),
  date: isoDate,
  accountId: z.string().min(1),
}).partial();
export const sacSuggestionQuery = z.object({ month: yearMonth, jobId: z.string().min(1) });

export interface PayslipDto {
  id: string; jobId: string; month: string; kind: z.infer<typeof payslipKind>; gross: number | null; net: number;
  date: string | null; accountId: string | null; status: z.infer<typeof txStatus> | null;
}
/** basis: en trabajos en negro la sugerencia sale del neto (no hay bruto). */
export interface SacSuggestionDto { month: string; basedOnMonths: number; suggested: number | null; basis: "gross" | "net" }

// ---- Inversiones ----
export const snapshotInput = z.object({ accountId: z.string().min(1), date: isoDate, balance: z.number().finite().min(0) });
export const investmentMovementInput = z.object({
  /** cuenta de inversión */
  accountId: z.string().min(1),
  kind: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  /** la otra punta: de dónde sale el depósito o adónde va el retiro */
  otherAccountId: z.string().min(1),
  date: isoDate,
  amount: z.number().finite().positive(),
});

export interface InvestmentRowDto {
  id: string; date: string; theoretical: number; real: number; gain: number; periodGain: number; returnPct: number | null;
}
export interface InvestmentMovementDto {
  /** DEPOSIT/WITHDRAWAL: transferencias con otra cuenta. INCOME/EXPENSE: ingresos y gastos cargados directo en la cuenta (otherAccountId vacío). */
  id: string; date: string; kind: "DEPOSIT" | "WITHDRAWAL" | "INCOME" | "EXPENSE"; amount: number; otherAccountId: string; description: string;
}
export interface InvestmentAccountDto {
  accountId: string; name: string; initialBalance: number;
  deposits: number; withdrawals: number; theoretical: number;
  /** último saldo real anotado y la ganancia a esa fecha */
  lastSnapshot: { id: string; date: string; real: number } | null;
  gain: number | null; gainPct: number | null;
  /** último real + movimientos posteriores (o el teórico si nunca anotaste el real) */
  currentEstimate: number;
  snapshots: InvestmentRowDto[]; movements: InvestmentMovementDto[];
}
export interface InvestmentsDto {
  accounts: InvestmentAccountDto[];
  totals: { theoretical: number; currentEstimate: number; gain: number };
  /** plata invertida por mes (depósitos − retiros) para el dashboard */
  byMonth: { month: string; deposits: number; withdrawals: number; net: number }[];
}

// ---- Dashboard y exportación ----
export const dashboardQuery = z.object({ month: yearMonth, months: z.coerce.number().int().min(3).max(36).default(12) });
export const exportQuery = z.object({ from: yearMonth, to: yearMonth.optional() });

export interface DashboardSeriesPoint {
  month: string; income: number;
  /** pagos de resúmenes de tarjeta / movimientos de recurrentes / el resto de los gastos */
  cards: number; recurring: number; other: number;
  expense: number; reimbursements: number; netExpense: number; balance: number;
  /** resultado acumulado desde el primer mes del rango */
  cumulativeBalance: number;
  /** depósitos − retiros de cuentas de inversión */
  invested: number;
}
export interface DashboardDto {
  month: string;
  kpis: {
    income: number; expense: number; reimbursements: number; netExpense: number; balance: number;
    /** gasto neto / ingresos (%) */ expenseRatio: number | null;
    /** resultado / ingresos (%) */ savingsRate: number | null;
    /** neto propio de los resúmenes de tarjeta del mes (sin lo de terceros ni reintegros) y su relación con el ingreso (%) */
    cardNet: number; cardRatio: number | null;
  };
  netWorth: {
    cash: number; investments: number; total: number;
    /** saldo de cada cuenta activa (las de inversión, al valor estimado) */
    accounts: { accountId: string; name: string; kind: z.infer<typeof accountKind>; balance: number }[];
  };
  series: DashboardSeriesPoint[];
  categories: { categoryId: string | null; name: string; amount: number; pct: number }[];
  budgets: { totals: BudgetsDto["totals"]; flagged: BudgetRowDto[] };
  debtors: PersonSummaryDto[];
}

// ---- gastos compartidos (formulario con la pareja) ----
export const sharedPayer = z.enum(["ME", "PARTNER"]);
export const sharedConfigInput = z.object({
  meName: z.string().trim().min(1).max(40),
  partnerName: z.string().trim().min(1).max(40),
  sourceUrl: z.string().trim().url().startsWith("https://").max(1000).nullable(),
  fromMonth: yearMonth,
  defaultAccountId: z.string().nullable(),
  groupId: z.string().nullable(),
}).partial();
export const sharedImportInput = z.object({ csv: z.string().max(5_000_000).optional() });
/** Cómo pagué yo: desde una cuenta, o con tarjeta (en cuotas). */
const sharedMethod = { accountId: z.string().nullable().optional(), cardId: z.string().nullable().optional(), installmentCount: z.number().int().min(1).max(60).optional() };
export const sharedEntryInput = z.object({
  date: isoDate, payer: sharedPayer, kind: z.string().trim().min(1).max(60), description: z.string().trim().max(200).default(""),
  amount: money.positive(), ...sharedMethod,
});
export const sharedEntryPatch = sharedEntryInput.partial();
export const sharedKindInput = z.object({ kind: z.string().trim().min(1).max(60), categoryId: z.string().nullable() });
export const sharedSettleInput = z.object({ month: yearMonth, date: isoDate, accountId: z.string().min(1), amount: money.refine((n) => n !== 0, "El monto no puede ser 0") });
export const sharedMonthQuery = z.object({ month: yearMonth });

export interface SharedConfigDto {
  meName: string; partnerName: string; sourceUrl: string | null; fromMonth: string; defaultAccountId: string | null;
  groupId: string | null; lastSyncAt: string | null;
}
export interface SharedEntryDto {
  id: string; date: string; payer: z.infer<typeof sharedPayer>; kind: string; description: string; amount: number; source: "FORM" | "MANUAL";
  accountId: string | null; cardId: string | null; installmentCount: number;
}
export interface SharedKindRowDto { kind: string; categoryId: string | null; total: number; pct: number; myShare: number }
export interface SharedSettlementDto { transactionId: string; date: string; amount: number; accountId: string }
export interface SharedMonthDto {
  month: string; groupId: string | null; percent: number; percentIsOwn: boolean;
  total: number; myShare: number; partnerShare: number; paidByMe: number; paidByPartner: number;
  /** > 0: la pareja me debe; < 0: le debo. */
  balance: number; settled: number; pending: number;
  byKind: SharedKindRowDto[]; entries: SharedEntryDto[]; settlements: SharedSettlementDto[];
  /** Recurrentes del grupo en el mes: ya están sumados al total, a mi parte y a la de la pareja (no al saldo). */
  recurring: { id: string; name: string; total: number; myShare: number }[];
  /** Recurrentes del mismo grupo activos en el mes: si también se cargan en el formulario se cuentan dos veces. */
  overlappingRecurring: string[];
}
export interface SharedImportResultDto { created: number; removed: number; unchanged: number; skippedBefore: number; errors: { line: number; message: string }[] }
