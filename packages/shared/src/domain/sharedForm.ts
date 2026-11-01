import { toCents } from "./money.js";

/** CSV RFC 4180: respeta comillas, comillas dobles escapadas y saltos de línea dentro de un campo. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = delimiter ?? ((firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Monto escrito a la argentina o a la inglesa: "25349,02", "83.665,47", "1.200", "3199.33", "$ 1.500".
 * El último separador que aparece es el decimal; un punto solo con grupos de 3 dígitos es de miles.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[$\s]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma >= 0) normalized = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, "");
  else normalized = s;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Marca temporal de Google Forms ("2/01/2024 19:48:23", día primero) o ISO → "YYYY-MM-DD". */
export function parseFormDate(raw: string): string | null {
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dmy) return null;
  const [d, m, y] = [Number(dmy[1]), Number(dmy[2]), dmy[3]!];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type SharedPayer = "ME" | "PARTNER";
export interface FormRow { key: string; date: string; payer: SharedPayer; kind: string; description: string; amount: number }
export interface FormParseResult { rows: FormRow[]; errors: { line: number; message: string }[] }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Lee las respuestas del formulario "Gastos Comunes". Cada tipo de gasto tiene sus propias columnas
 * ("Monto de la Compra", "Elija Plataforma"...): de cada fila se toma el primer monto y el primer detalle cargados.
 */
export function parseFormCsv(text: string, names: { me: string; partner: string }): FormParseResult {
  const [header, ...data] = parseCsv(text);
  const errors: FormParseResult["errors"] = [];
  if (!header) return { rows: [], errors: [{ line: 1, message: "El archivo está vacío" }] };
  const h = header.map(norm);
  const find = (pred: (x: string) => boolean, fallback: number) => { const i = h.findIndex(pred); return i >= 0 ? i : fallback; };
  const iDate = find((x) => x.includes("marca temporal") || x === "timestamp", 0);
  const iPayer = find((x) => x.includes("pagado"), 1);
  const iKind = find((x) => x.includes("tipo"), 2);
  const fixed = new Set([iDate, iPayer, iKind]);
  const amountCols = h.map((x, i) => (!fixed.has(i) && x.startsWith("monto") ? i : -1)).filter((i) => i >= 0);
  const detailCols = h.map((x, i) => (!fixed.has(i) && x !== "" && !x.startsWith("monto") ? i : -1)).filter((i) => i >= 0);
  const me = norm(names.me), partner = norm(names.partner);

  const rows: FormRow[] = [];
  data.forEach((cells, idx) => {
    const line = idx + 2;
    const cell = (i: number) => (cells[i] ?? "").trim();
    const date = parseFormDate(cell(iDate));
    if (!date) return errors.push({ line, message: `Fecha inválida: "${cell(iDate)}"` });
    const who = norm(cell(iPayer));
    const payer: SharedPayer | null = who === me ? "ME" : who === partner ? "PARTNER" : null;
    if (!payer) return errors.push({ line, message: `No reconozco quién pagó: "${cell(iPayer)}"` });
    const kind = cell(iKind) || "Varios";
    const rawAmount = amountCols.map(cell).find((x) => x !== "");
    const amount = rawAmount == null ? null : parseAmount(rawAmount);
    if (amount == null || amount <= 0) return errors.push({ line, message: rawAmount ? `Monto inválido: "${rawAmount}"` : "Falta el monto" });
    const description = detailCols.map(cell).find((x) => x !== "") ?? "";
    // la marca temporal tiene segundos: junto con quién pagó y el monto identifica la respuesta aunque se reimporte
    const key = [cell(iDate), payer, kind, toCents(amount)].join("|");
    rows.push({ key, date, payer, kind, description, amount });
  });
  return { rows, errors };
}

/**
 * Cierre del mes: mi parte de cada tipo (total × mi %) y el saldo con la otra persona.
 * saldo > 0 → me deben; saldo < 0 → debo yo.
 */
export function sharedMonthCents(entries: { payer: SharedPayer; kind: string; cents: number }[], myPercent: number) {
  const byKind = new Map<string, { totalCents: number; myCents: number }>();
  let paidByMe = 0, paidByPartner = 0;
  for (const e of entries) {
    const k = byKind.get(e.kind) ?? { totalCents: 0, myCents: 0 };
    k.totalCents += e.cents;
    byKind.set(e.kind, k);
    if (e.payer === "ME") paidByMe += e.cents;
    else paidByPartner += e.cents;
  }
  for (const k of byKind.values()) k.myCents = Math.round((k.totalCents * myPercent) / 100);
  const totalCents = paidByMe + paidByPartner;
  const myShareCents = [...byKind.values()].reduce((a, k) => a + k.myCents, 0);
  return { byKind, totalCents, myShareCents, paidByMe, paidByPartner, balanceCents: paidByMe - myShareCents };
}
