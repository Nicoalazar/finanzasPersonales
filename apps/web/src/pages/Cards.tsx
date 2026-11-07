import { useEffect, useState, type FormEvent } from "react";
import type { CardDto, StatementDto } from "@finanzas/shared";
import { PurchaseForm } from "../components/PurchaseForm";
import { MonthNav } from "../components/MonthNav";
import { iconBtn, iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, formatRate, formatUsd, monthLabel, shiftMonth } from "../lib/format";
import {
  useAccounts, useCards, useCommitments, useCreateCard, useDeletePurchase, useMovePurchase, usePatchCard, usePatchStatement, usePayStatement, useStatement, useUnpayStatement,
} from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "field";
const parseNum = (s: string) => Number(s.replace(",", ".")) || 0;

function NewCardForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCard();
  const [f, setF] = useState({ name: "", closingDay: "25", dueDay: "5" });
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ name: f.name, closingDay: Number(f.closingDay), dueDay: Number(f.dueDay) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };
  return (
    <form onSubmit={submit} className="card flex flex-wrap items-center gap-2 p-3">
      <input className={field} placeholder="Nombre (ej. Visa)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <label className="text-xs text-muted">Cierre <input className={`${field} w-16`} type="number" min={1} max={31} value={f.closingDay} onChange={(e) => setF({ ...f, closingDay: e.target.value })} /></label>
      <label className="text-xs text-muted">Vence <input className={`${field} w-16`} type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} /></label>
      <button className="btn-primary">Crear</button>
      <button type="button" className="text-sm text-muted" onClick={onDone}>Cancelar</button>
      {error && <span role="alert" className="text-sm text-neg">{error}</span>}
    </form>
  );
}

function StatementView({ card, st, month }: { card: CardDto; st: StatementDto; month: string }) {
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const patch = usePatchStatement(card.id);
  const pay = usePayStatement(card.id);
  const unpay = useUnpayStatement(card.id);
  const delPurchase = useDeletePurchase();
  const move = useMovePurchase();
  const [adjustment, setAdjustment] = useState(String(st.adjustment));
  const [refunds, setRefunds] = useState(String(st.refunds));
  const [usdRate, setUsdRate] = useState(st.usdRate == null ? "" : String(st.usdRate));
  const [accountId, setAccountId] = useState(card.payAccountId ?? "");
  const [payDate, setPayDate] = useState(st.dueDate);
  const [error, setError] = useState("");
  useEffect(() => { setAdjustment(String(st.adjustment)); setRefunds(String(st.refunds)); }, [st.adjustment, st.refunds]);
  useEffect(() => setUsdRate(st.usdRate == null ? "" : String(st.usdRate)), [st.usdRate]);
  useEffect(() => setPayDate(st.dueDate), [st.dueDate]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  const row = "flex justify-between gap-3 px-4 py-1.5 text-sm";

  return (
    <section className="space-y-3">
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        {([["closingDate", "Cierre", st.closingDate, st.closingIsCustom], ["dueDate", "Vencimiento", st.dueDate, st.dueIsCustom]] as const).map(([key, label, value, custom]) => (
          <label key={key} className="flex w-full items-center gap-2 sm:w-auto">
            <span className="w-24 shrink-0 text-muted sm:w-auto">{label}{custom && <span className="block text-[11px] sm:inline"> (editado)</span>}</span>
            <input className={`${field} flex-1 sm:flex-none`} type="date" value={value} required
              onChange={(e) => e.target.value && guard(() => patch.mutateAsync({ month, [key]: e.target.value }))} />
            {custom && <button className="link text-xs" onClick={() => guard(() => patch.mutateAsync({ month, [key]: null }))}>Restablecer</button>}
          </label>
        ))}
        <p className="w-full text-xs text-muted">Las fechas cambian mes a mes. Al editar el cierre, las compras ya cargadas no se mueven solas: usá ‹ › en cada una.</p>
      </div>

      <div className="card divide-y">
        {st.items.length === 0 && <p className="p-4 text-sm text-muted">No hay cuotas en este resumen.</p>}
        {st.items.map((i) => (
          <div key={i.installmentId} className="py-2 pl-4 pr-2">
            <div className="flex items-baseline justify-between gap-2 pr-2">
              <span className="truncate text-sm">{i.description}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(i.amount)}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1 text-xs text-muted">
                {i.usdAmount != null ? `${formatUsd(i.usdAmount)} × ${formatRate(i.rate!)}${st.usdEstimated ? " (estimada)" : ""}` : `Cuota ${i.number}/${i.count}`}
                {i.shares.map((s) => ` · ${s.name} ${formatMoney(s.amount)}`).join("")}
              </div>
              {[-1, 1].map((d) => (
                <button key={d} className={iconBtn} aria-label={d < 0 ? "Pasar al resumen anterior" : "Pasar al resumen siguiente"}
                  title={`${d < 0 ? "Pasar al resumen anterior" : "Pasar al resumen siguiente"} (mueve toda la compra)`}
                  onClick={() => guard(() => move.mutateAsync({ id: i.purchaseId, firstStatementMonth: shiftMonth(month, d - (i.number - 1)) }))}>
                  {d < 0 ? "‹" : "›"}
                </button>
              ))}
              <button className={iconBtnDanger} aria-label="Eliminar compra" title="Eliminar la compra completa"
                onClick={() => confirm(`¿Eliminar "${i.description}" y todas sus cuotas?`) && guard(() => delPurchase.mutateAsync(i.purchaseId))}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card divide-y">
        <div className={row}><span>Subtotal <span className="text-xs text-muted">(consumos en pesos)</span></span><span>{formatMoney(st.subtotal)}</span></div>
        <div className={row}><span>Impuesto {(card.stampTaxRate * 1000).toFixed(0)}‰ <span className="text-xs text-muted">(del subtotal)</span></span><span>{formatMoney(st.stampTax)}</span></div>
        <div className={`${row} items-center`}>
          <label htmlFor="adj">Ajuste (percepciones, intereses)</label>
          <NumberInput id="adj" className={`${field} w-28 shrink-0 text-right sm:w-32`} value={adjustment} disabled={!!st.paidAt}
            onChange={setAdjustment} onBlur={() => parseNum(adjustment) !== st.adjustment && guard(() => patch.mutateAsync({ month, adjustment: parseNum(adjustment) }))} />
        </div>
        <div className={`${row} font-semibold`}><span>Total del resumen en pesos</span><span>{formatMoney(st.arsTotal)}</span></div>
        {st.usdSubtotal > 0 && (
          <>
            <div className={row}><span>Consumos en USD</span><span>{formatUsd(st.usdSubtotal)}</span></div>
            <div className={`${row} items-center`}>
              <label htmlFor="usdRate">
                Cotización del dólar del resumen
                {st.usdEstimated && <span className="tag ml-2 bg-warn-soft text-warn-ink">estimada{st.usdEffectiveRate != null && ` ${formatRate(st.usdEffectiveRate)}`}</span>}
              </label>
              <NumberInput id="usdRate" className={`${field} w-28 shrink-0 text-right sm:w-32`} placeholder="la del banco" value={usdRate} disabled={!!st.paidAt}
                onChange={setUsdRate}
                onBlur={() => {
                  const v = parseNum(usdRate);
                  if ((v || null) !== st.usdRate) guard(() => patch.mutateAsync({ month, usdRate: v > 0 ? v : null }));
                }} />
            </div>
            {st.usdEstimated && (
              <p className="px-4 py-1.5 text-xs text-warn">Cada consumo usa la cotización estimada al cargarlo. Cargá la del resumen del banco para fijar el total y poder pagarlo.</p>
            )}
            <div className={`${row} font-semibold`}>
              <span>Subtotal con consumos en dólares <span className="text-xs font-normal text-muted">({formatMoney(st.usdSubtotalArs)} en USD{st.usdEstimated ? ", estimado" : ""})</span></span>
              <span>{formatMoney(st.total)}</span>
            </div>
          </>
        )}
        <div className={row}><span>Corresponde a terceros</span><span>− {formatMoney(st.thirdParty)}</span></div>
        <div className={`${row} items-center`}>
          <label htmlFor="ref">Reintegros</label>
          <NumberInput id="ref" className={`${field} w-28 shrink-0 text-right sm:w-32`} value={refunds} disabled={!!st.paidAt}
            onChange={setRefunds} onBlur={() => parseNum(refunds) !== st.refunds && guard(() => patch.mutateAsync({ month, refunds: parseNum(refunds) }))} />
        </div>
        <div className={`${row} font-semibold text-neg`}><span>Neto propio</span><span>{formatMoney(st.netOwn)}</span></div>
      </div>

      {st.byPerson.length > 0 && (
        <div className="card p-4 text-sm">
          <div className="mb-1 text-xs font-medium text-muted">Te deben este resumen{st.usdEstimated && " · incluye consumos en USD estimados"}</div>
          {st.byPerson.map((p) => <div key={p.personId} className="flex justify-between"><span>{p.name}</span><span>{formatMoney(p.amount)}</span></div>)}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-4">
        {st.paidAt ? (
          <>
            <span className="text-sm text-pos">Pagado el {st.paidAt}</span>
            <button className="link text-sm" onClick={() => confirm("¿Deshacer el pago? Se elimina el movimiento.") && guard(() => unpay.mutateAsync(month))}>Deshacer</button>
          </>
        ) : (
          <>
            <select className={`${field} flex-1 sm:flex-none`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Cuenta de pago</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className={`${field} flex-1 sm:flex-none`} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <button className="btn-primary w-full sm:w-auto" disabled={st.total <= 0 || pay.isPending || st.usdEstimated}
              onClick={() => guard(() => pay.mutateAsync({ month, date: payDate, accountId: accountId || undefined }))}>
              Pagar {formatMoney(st.total)}
            </button>
            {st.usdEstimated && <span className="text-xs text-warn">Cargá la cotización del dólar para poder pagar</span>}
          </>
        )}
        {error && <span role="alert" className="text-sm text-neg">{error}</span>}
      </div>
    </section>
  );
}

export function Cards() {
  const cards = useCards().data ?? [];
  const [cardId, setCardId] = useState<string>();
  const [month, setMonth] = useState(currentMonth());
  const [adding, setAdding] = useState(false);
  const [newCard, setNewCard] = useState(false);
  const card = cards.find((c) => c.id === cardId) ?? cards[0]; // la API trae primero la predeterminada
  const patchCard = usePatchCard();
  const st = useStatement(card?.id, month).data;
  const commitments = useCommitments(currentMonth()).data ?? [];
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.name ?? "?";

  return (
    <main className="space-y-4">
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {cards.map((c) => (
          <button key={c.id} onClick={() => setCardId(c.id)} className={`${c.id === card?.id ? "seg-on" : "seg-off"}`}>{c.name}</button>
        ))}
        {!newCard && <button className="btn-soft" onClick={() => setNewCard(true)}>+ Tarjeta</button>}
      </div>
      {newCard && <NewCardForm onDone={() => setNewCard(false)} />}

      {!card ? (
        <p className="rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn-ink">Creá tu primera tarjeta para empezar a cargar compras en cuotas.</p>
      ) : (
        <>
          <MonthNav month={month} onChange={setMonth}>
            {!adding && <button className="btn-primary" onClick={() => setAdding(true)}>+ Compra</button>}
          </MonthNav>
          <p className="-mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span>Por defecto cierra el día {card.closingDay} y vence el {card.dueDay}</span>
            {card.isDefault ? <span className="text-warn" title="Se muestra primero en todas las pantallas">★ Predeterminada</span> : (
              cards.length > 1 && <button className="link" onClick={() => patchCard.mutate({ id: card.id, patch: { isDefault: true } })}
                title="Se muestra primero en todas las pantallas">☆ Usar como predeterminada</button>
            )}
          </p>
          {adding && <PurchaseForm card={card} onDone={() => setAdding(false)} />}
          {st && <StatementView key={`${card.id}-${month}`} card={card} st={st} month={month} />}
        </>
      )}

      {commitments.some((m) => m.total > 0) && (
        <section>
          <h2 className="mb-2 font-semibold">Compromisos próximos 12 meses <span className="text-xs font-normal text-muted">· neto propio, sin lo de terceros</span></h2>
          <div className="card divide-y">
            {commitments.map((m) => (
              <div key={m.month} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-2 text-sm sm:grid-cols-[11rem_1fr_auto]">
                <span>{monthLabel(m.month)}</span>
                <span className="order-last col-span-2 text-xs text-muted sm:order-none sm:col-span-1">{m.byCard.map((c) => `${nameOf(c.cardId)} ${formatMoney(c.total)}`).join(" · ")}</span>
                <span className="text-right font-medium tabular-nums">{formatMoney(m.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
