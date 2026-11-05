import { useEffect, useState, type FormEvent } from "react";
import type { CardDto, StatementDto } from "@finanzas/shared";
import { PurchaseForm } from "../components/PurchaseForm";
import { MonthNav } from "../components/MonthNav";
import { iconBtn, iconBtnDanger } from "../components/Stats";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../lib/format";
import {
  useAccounts, useCards, useCommitments, useCreateCard, useDeletePurchase, useMovePurchase, usePatchStatement, usePayStatement, useStatement, useUnpayStatement,
} from "../lib/queries";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
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
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">
      <input className={field} placeholder="Nombre (ej. Visa)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <label className="text-xs text-slate-500">Cierre <input className={`${field} w-16`} type="number" min={1} max={31} value={f.closingDay} onChange={(e) => setF({ ...f, closingDay: e.target.value })} /></label>
      <label className="text-xs text-slate-500">Vence <input className={`${field} w-16`} type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} /></label>
      <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Crear</button>
      <button type="button" className="text-sm text-slate-500" onClick={onDone}>Cancelar</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
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
  const [accountId, setAccountId] = useState(card.payAccountId ?? "");
  const [payDate, setPayDate] = useState(st.dueDate);
  const [error, setError] = useState("");
  useEffect(() => { setAdjustment(String(st.adjustment)); setRefunds(String(st.refunds)); }, [st.adjustment, st.refunds]);
  useEffect(() => setPayDate(st.dueDate), [st.dueDate]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };
  const row = "flex justify-between gap-3 px-4 py-1.5 text-sm";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white px-4 py-3 text-sm shadow">
        {([["closingDate", "Cierre", st.closingDate, st.closingIsCustom], ["dueDate", "Vencimiento", st.dueDate, st.dueIsCustom]] as const).map(([key, label, value, custom]) => (
          <label key={key} className="flex w-full items-center gap-2 sm:w-auto">
            <span className="w-24 shrink-0 text-slate-500 sm:w-auto">{label}{custom && <span className="block text-[11px] sm:inline"> (editado)</span>}</span>
            <input className={`${field} flex-1 sm:flex-none`} type="date" value={value} required
              onChange={(e) => e.target.value && guard(() => patch.mutateAsync({ month, [key]: e.target.value }))} />
            {custom && <button className="text-xs text-slate-500 underline" onClick={() => guard(() => patch.mutateAsync({ month, [key]: null }))}>Restablecer</button>}
          </label>
        ))}
        <p className="w-full text-xs text-slate-500">Las fechas cambian mes a mes. Al editar el cierre, las compras ya cargadas no se mueven solas: usá ‹ › en cada una.</p>
      </div>

      <div className="divide-y rounded-xl bg-white shadow">
        {st.items.length === 0 && <p className="p-4 text-sm text-slate-500">No hay cuotas en este resumen.</p>}
        {st.items.map((i) => (
          <div key={i.installmentId} className="py-2 pl-4 pr-2">
            <div className="flex items-baseline justify-between gap-2 pr-2">
              <span className="truncate text-sm">{i.description}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(i.amount)}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1 text-xs text-slate-500">
                Cuota {i.number}/{i.count}
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

      <div className="divide-y rounded-xl bg-white shadow">
        <div className={row}><span>Subtotal</span><span>{formatMoney(st.subtotal)}</span></div>
        <div className={row}><span>Impuesto {(card.stampTaxRate * 1000).toFixed(0)}‰</span><span>{formatMoney(st.stampTax)}</span></div>
        <div className={`${row} items-center`}>
          <label htmlFor="adj">Ajuste (percepciones, intereses)</label>
          <input id="adj" className={`${field} w-28 shrink-0 text-right sm:w-32`} inputMode="decimal" value={adjustment} disabled={!!st.paidAt}
            onChange={(e) => setAdjustment(e.target.value)} onBlur={() => parseNum(adjustment) !== st.adjustment && guard(() => patch.mutateAsync({ month, adjustment: parseNum(adjustment) }))} />
        </div>
        <div className={`${row} font-semibold`}><span>Total del resumen</span><span>{formatMoney(st.total)}</span></div>
        <div className={row}><span>Corresponde a terceros</span><span>− {formatMoney(st.thirdParty)}</span></div>
        <div className={`${row} items-center`}>
          <label htmlFor="ref">Reintegros</label>
          <input id="ref" className={`${field} w-28 shrink-0 text-right sm:w-32`} inputMode="decimal" value={refunds} disabled={!!st.paidAt}
            onChange={(e) => setRefunds(e.target.value)} onBlur={() => parseNum(refunds) !== st.refunds && guard(() => patch.mutateAsync({ month, refunds: parseNum(refunds) }))} />
        </div>
        <div className={`${row} font-semibold text-rose-600`}><span>Neto propio</span><span>{formatMoney(st.netOwn)}</span></div>
      </div>

      {st.byPerson.length > 0 && (
        <div className="rounded-xl bg-white p-4 text-sm shadow">
          <div className="mb-1 text-xs font-medium text-slate-500">Te deben este resumen</div>
          {st.byPerson.map((p) => <div key={p.personId} className="flex justify-between"><span>{p.name}</span><span>{formatMoney(p.amount)}</span></div>)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow">
        {st.paidAt ? (
          <>
            <span className="text-sm text-emerald-700">Pagado el {st.paidAt}</span>
            <button className="text-sm text-slate-500 underline" onClick={() => confirm("¿Deshacer el pago? Se elimina el movimiento.") && guard(() => unpay.mutateAsync(month))}>Deshacer</button>
          </>
        ) : (
          <>
            <select className={`${field} flex-1 sm:flex-none`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Cuenta de pago</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className={`${field} flex-1 sm:flex-none`} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <button className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm text-white sm:w-auto" disabled={st.total <= 0 || pay.isPending}
              onClick={() => guard(() => pay.mutateAsync({ month, date: payDate, accountId: accountId || undefined }))}>
              Pagar {formatMoney(st.total)}
            </button>
          </>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
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
  const card = cards.find((c) => c.id === cardId) ?? cards[0];
  const st = useStatement(card?.id, month).data;
  const commitments = useCommitments(currentMonth()).data ?? [];
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.name ?? "?";

  return (
    <main className="space-y-4">
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {cards.map((c) => (
          <button key={c.id} onClick={() => setCardId(c.id)} className={`shrink-0 rounded px-3 py-1.5 text-sm ${c.id === card?.id ? "bg-slate-900 text-white" : "bg-white shadow"}`}>{c.name}</button>
        ))}
        {!newCard && <button className="shrink-0 rounded bg-white px-3 py-1.5 text-sm shadow" onClick={() => setNewCard(true)}>+ Tarjeta</button>}
      </div>
      {newCard && <NewCardForm onDone={() => setNewCard(false)} />}

      {!card ? (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Creá tu primera tarjeta para empezar a cargar compras en cuotas.</p>
      ) : (
        <>
          <MonthNav month={month} onChange={setMonth}>
            {!adding && <button className="rounded bg-slate-900 px-3 py-1.5 text-white" onClick={() => setAdding(true)}>+ Compra</button>}
          </MonthNav>
          <p className="-mt-2 text-xs text-slate-500">Por defecto cierra el día {card.closingDay} y vence el {card.dueDay}</p>
          {adding && <PurchaseForm card={card} onDone={() => setAdding(false)} />}
          {st && <StatementView key={`${card.id}-${month}`} card={card} st={st} month={month} />}
        </>
      )}

      {commitments.some((m) => m.total > 0) && (
        <section>
          <h2 className="mb-2 font-semibold">Compromisos próximos 12 meses <span className="text-xs font-normal text-slate-500">· neto propio, sin lo de terceros</span></h2>
          <div className="divide-y rounded-xl bg-white shadow">
            {commitments.map((m) => (
              <div key={m.month} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-2 text-sm sm:grid-cols-[11rem_1fr_auto]">
                <span>{monthLabel(m.month)}</span>
                <span className="order-last col-span-2 text-xs text-slate-500 sm:order-none sm:col-span-1">{m.byCard.map((c) => `${nameOf(c.cardId)} ${formatMoney(c.total)}`).join(" · ")}</span>
                <span className="text-right font-medium tabular-nums">{formatMoney(m.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
