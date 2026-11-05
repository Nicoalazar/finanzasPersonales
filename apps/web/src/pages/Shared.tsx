import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SharedConfigDto, SharedEntryDto, SharedImportResultDto } from "@finanzas/shared";
import { MonthNav } from "../components/MonthNav";
import { iconBtnDanger } from "../components/Stats";
import { currentMonth, formatDay, formatMoney, today } from "../lib/format";
import {
  useAccounts, useCards, useCategories, useClearGroupPercent, useCreateSharedEntry, useDeleteSettlement, useDeleteSharedEntry, useImportShared,
  usePatchSharedConfig, usePatchSharedEntry, useSetGroupPercent, useSetSharedKind, useSettleShared, useSharedConfig, useSharedGroups, useSharedMonth,
} from "../lib/queries";
import { NumberInput } from "../components/NumberInput";

const field = "rounded border bg-white px-2 py-1.5 text-sm";
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const errText = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** "acc:<id>" | "card:<id>" | "" (cuenta por defecto) */
const methodOf = (e: SharedEntryDto) => (e.cardId ? `card:${e.cardId}` : e.accountId ? `acc:${e.accountId}` : "");

function ImportResult({ r }: { r: SharedImportResultDto }) {
  return (
    <div className="space-y-1 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900 shadow">
      <p>
        Importados {r.created} nuevos · {r.unchanged} sin cambios{r.removed > 0 && ` · ${r.removed} quitados (ya no están en la planilla)`}
        {r.skippedBefore > 0 && ` · ${r.skippedBefore} anteriores al mes de inicio`}
      </p>
      {r.errors.length > 0 && (
        <details className="text-amber-900">
          <summary className="cursor-pointer">{r.errors.length} fila{r.errors.length > 1 ? "s" : ""} sin importar</summary>
          <ul className="mt-1 list-disc pl-5 text-xs">{r.errors.map((e) => <li key={e.line}>Fila {e.line}: {e.message}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function Config({ config, onError }: { config: SharedConfigDto; onError: (m: string) => void }) {
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const groups = useSharedGroups(currentMonth()).data ?? [];
  const patch = usePatchSharedConfig();
  const [f, setF] = useState(config);
  useEffect(() => setF(config), [config]);
  const set = (k: keyof SharedConfigDto) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value || null });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await patch.mutateAsync({
        meName: f.meName, partnerName: f.partnerName, sourceUrl: f.sourceUrl?.trim() || null, fromMonth: f.fromMonth,
        defaultAccountId: f.defaultAccountId, groupId: f.groupId,
      });
    } catch (err) { onError(errText(err)); }
  };

  return (
    <details className="rounded-xl bg-white shadow">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Configuración del formulario
        {!config.defaultAccountId && <span className="ml-2 text-xs font-normal text-amber-700">· falta elegir la cuenta de mis pagos</span>}
      </summary>
      <form onSubmit={save} className="grid gap-3 px-4 pb-4 text-sm sm:grid-cols-2">
        <label className="space-y-1"><span className="text-xs text-slate-500">Mi nombre en "Pagado por"</span>
          <input className={`${field} w-full`} value={f.meName} onChange={set("meName")} required /></label>
        <label className="space-y-1"><span className="text-xs text-slate-500">Nombre de mi pareja</span>
          <input className={`${field} w-full`} value={f.partnerName} onChange={set("partnerName")} required /></label>
        <label className="space-y-1"><span className="text-xs text-slate-500">Mis pagos salen de</span>
          <select className={`${field} w-full`} value={f.defaultAccountId ?? ""} onChange={set("defaultAccountId")}>
            <option value="">Elegí una cuenta…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
        <label className="space-y-1"><span className="text-xs text-slate-500">Importar respuestas desde</span>
          <input type="month" className={`${field} w-full`} value={f.fromMonth} onChange={set("fromMonth")} required /></label>
        <label className="space-y-1"><span className="text-xs text-slate-500">Grupo (define mi % de cada mes)</span>
          <select className={`${field} w-full`} value={f.groupId ?? ""} onChange={set("groupId")}>
            <option value="">Sin grupo (50 %)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs text-slate-500">Link del CSV publicado (opcional)</span>
          <input className={`${field} w-full`} type="url" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&output=csv" value={f.sourceUrl ?? ""} onChange={set("sourceUrl")} /></label>
        <p className="text-xs text-slate-500 sm:col-span-2">
          Para sincronizar con un botón: en la planilla de respuestas, Archivo → Compartir → Publicar en la Web, elegí la hoja de respuestas y
          "Valores separados por comas (.csv)". Cualquiera con ese link puede ver la hoja; si preferís no publicarla, descargala como CSV y subila con "Subir CSV".
        </p>
        <div className="sm:col-span-2"><button className="rounded bg-slate-900 px-3 py-1.5 text-white" disabled={patch.isPending}>Guardar</button></div>
      </form>
    </details>
  );
}

function AddEntry({ month, config, onDone, onError }: { month: string; config: SharedConfigDto; onDone: () => void; onError: (m: string) => void }) {
  const create = useCreateSharedEntry();
  const [f, setF] = useState({ date: month === currentMonth() ? today() : `${month}-01`, payer: "ME", kind: "", description: "", amount: "" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ ...f, amount: parseNum(f.amount) });
      onDone();
    } catch (err) { onError(errText(err)); }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl bg-white p-4 text-sm shadow sm:grid-cols-6">
      <input type="date" className={`${field} sm:col-span-2`} value={f.date} onChange={set("date")} required aria-label="Fecha" />
      <select className={`${field} sm:col-span-2`} value={f.payer} onChange={set("payer")} aria-label="Pagó">
        <option value="ME">Pagué yo ({config.meName})</option>
        <option value="PARTNER">Pagó {config.partnerName}</option>
      </select>
      <NumberInput className={`${field} sm:col-span-2`} placeholder="Monto" value={f.amount} onChange={(v) => set("amount")({ target: { value: v } })} required aria-label="Monto" />
      <input className={`${field} sm:col-span-2`} placeholder="Tipo (Mercadería…)" value={f.kind} onChange={set("kind")} required aria-label="Tipo" list="shared-kinds" />
      <input className={`${field} sm:col-span-3`} placeholder="Detalle" value={f.description} onChange={set("description")} aria-label="Detalle" />
      <div className="flex gap-2">
        <button className="rounded bg-slate-900 px-3 py-1.5 text-white" disabled={create.isPending}>Guardar</button>
        <button type="button" className="text-slate-500" onClick={onDone}>Cancelar</button>
      </div>
    </form>
  );
}

export function Shared() {
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState("");
  const [result, setResult] = useState<SharedImportResultDto | null>(null);
  const [adding, setAdding] = useState(false);
  const config = useSharedConfig().data;
  const { data: m } = useSharedMonth(month);
  const accounts = useAccounts().data?.filter((a) => !a.archived) ?? [];
  const cards = useCards().data ?? [];
  const categories = useCategories().data?.filter((c) => c.type === "EXPENSE") ?? [];
  const imp = useImportShared();
  const setPercent = useSetGroupPercent();
  const clearPercent = useClearGroupPercent();
  const setKind = useSetSharedKind();
  const patchEntry = usePatchSharedEntry();
  const delEntry = useDeleteSharedEntry();
  const settle = useSettleShared();
  const delSettlement = useDeleteSettlement();
  const file = useRef<HTMLInputElement>(null);

  const [pct, setPct] = useState("");
  useEffect(() => setPct(m ? String(m.percent).replace(".", ",") : ""), [m?.percent, month]);
  const [settleForm, setSettleForm] = useState({ date: today(), accountId: "", amount: "" });
  useEffect(() => setSettleForm((s) => ({ ...s, amount: m ? String(Math.abs(m.pending)).replace(".", ",") : "" })), [m?.pending, month]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError("");
    try { await fn(); } catch (e) { setError(errText(e)); }
  };
  const runImport = (csv?: string) => guard(async () => { setResult(null); setResult(await imp.mutateAsync(csv === undefined ? {} : { csv })); });
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    await runImport(await f.text());
    if (file.current) file.current.value = "";
  };
  const savePercent = () => guard(async () => {
    if (!m?.groupId) return;
    const n = parseNum(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("El % tiene que estar entre 0 y 100");
    if (n !== m.percent) await setPercent.mutateAsync({ id: m.groupId, month, percent: n });
  });
  const changeMethod = (e: SharedEntryDto, value: string) => {
    const [kind, id] = value.split(":");
    const patch = kind === "card" ? { cardId: id, installmentCount: 1 } : { accountId: id ?? null, cardId: null };
    return guard(() => patchEntry.mutateAsync({ id: e.id, patch }));
  };

  const kindSelect = (kind: string, categoryId: string | null, cls: string) => (
    <select className={`${field} ${cls}`} value={categoryId ?? ""} aria-label={`Categoría de ${kind}`}
      onChange={(e) => guard(() => setKind.mutateAsync({ kind, categoryId: e.target.value || null }))}>
      <option value="">Sin categoría</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );

  if (!config || !m) return <p className="text-sm text-slate-500">Cargando…</p>;
  const partner = config.partnerName;
  const owesMe = m.pending > 0;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "?";

  return (
    <main className="space-y-4">
      <MonthNav month={month} onChange={setMonth}>
        {config.sourceUrl && (
          <button className="rounded bg-slate-900 px-3 py-1.5 text-white" onClick={() => runImport()} disabled={imp.isPending}>
            {imp.isPending ? "Sincronizando…" : "Sincronizar"}
          </button>
        )}
        <label className="cursor-pointer rounded bg-white px-3 py-1.5 shadow">
          Subir CSV
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {!adding && <button className="rounded bg-white px-3 py-1.5 shadow" onClick={() => setAdding(true)}>+ Gasto</button>}
      </MonthNav>
      {config.lastSyncAt && <p className="-mt-2 text-xs text-slate-500">Última importación: {new Date(config.lastSyncAt).toLocaleString("es-AR")}</p>}

      {error && <p className="rounded bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      {result && <ImportResult r={result} />}
      {!config.defaultAccountId && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">Elegí de qué cuenta salen tus pagos para que se registren en tus movimientos.</p>}
      {m.recurring.length > 0 && (
        <p className="rounded bg-slate-100 p-3 text-sm text-slate-700">
          Recurrentes sumados al mes: {m.recurring.map((r) => `${r.name} (${formatMoney(r.total)}, mi parte ${formatMoney(r.myShare)})`).join(" · ")}.
          {m.overlappingRecurring.length > 0 && " Si también los cargan en el formulario se cuentan dos veces."}
        </p>
      )}

      <Config config={config} onError={setError} />
      {adding && <AddEntry month={month} config={config} onDone={() => setAdding(false)} onError={setError} />}
      <datalist id="shared-kinds">{m.byKind.map((k) => <option key={k.kind} value={k.kind} />)}</datalist>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-xs text-slate-500">Total común del mes</div>
          <div className="text-lg font-semibold">{formatMoney(m.total)}</div>
          <div className="text-xs text-slate-500">Pagué {formatMoney(m.paidByMe)} · {partner} {formatMoney(m.paidByPartner)}</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-xs text-slate-500">Mi parte</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold">{formatMoney(m.myShare)}</span>
            {m.groupId ? (
              <label className="flex items-center gap-1 text-sm">
                <NumberInput className={`${field} w-16 text-right`} value={pct} aria-label="Mi porcentaje del mes"
                  onChange={setPct} onBlur={savePercent} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />%
              </label>
            ) : <span className="text-sm text-slate-500">50 %</span>}
          </div>
          <div className="text-xs text-slate-500">
            {m.percentIsOwn ? (
              <>Fijado para este mes · <button className="underline" onClick={() => guard(() => clearPercent.mutateAsync({ id: m.groupId!, month }))}>usar el anterior</button></>
            ) : "Heredado del último mes cargado"}
            {" "}· {partner} {formatMoney(m.partnerShare)}
          </div>
        </div>
        <div className={`rounded-xl p-4 shadow ${m.pending === 0 ? "bg-white" : owesMe ? "bg-emerald-50" : "bg-rose-50"}`}>
          <div className="text-xs text-slate-500">Saldo</div>
          <div className="text-lg font-semibold">
            {m.pending === 0 ? (m.total > 0 ? "Saldado" : "—") : owesMe ? `${partner} te debe ${formatMoney(m.pending)}` : `Le debés ${formatMoney(-m.pending)}`}
          </div>
          {m.settled !== 0 && <div className="text-xs text-slate-500">Saldo del mes {formatMoney(m.balance)} · ya registrado {formatMoney(m.settled)}</div>}
        </div>
      </section>

      {(m.pending !== 0 || m.settlements.length > 0) && (
        <section className="space-y-2 rounded-xl bg-white p-4 text-sm shadow">
          {m.pending !== 0 && (
            <form className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap" onSubmit={(e) => {
              e.preventDefault();
              guard(() => settle.mutateAsync({ month, date: settleForm.date, accountId: settleForm.accountId || config.defaultAccountId || accounts[0]!.id, amount: (owesMe ? 1 : -1) * parseNum(settleForm.amount) }));
            }}>
              <span>{owesMe ? `${partner} me pagó` : `Le pagué a ${partner}`}</span>
              <NumberInput className={`${field} text-right sm:w-28`} value={settleForm.amount} onChange={(v) => setSettleForm({ ...settleForm, amount: v })} aria-label="Monto del saldo" required />
              <input type="date" className={field} value={settleForm.date} onChange={(e) => setSettleForm({ ...settleForm, date: e.target.value })} aria-label="Fecha del pago" required />
              <select className={field} value={settleForm.accountId || config.defaultAccountId || ""} onChange={(e) => setSettleForm({ ...settleForm, accountId: e.target.value })} aria-label="Cuenta">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-white" disabled={settle.isPending || accounts.length === 0}>Registrar</button>
            </form>
          )}
          {m.settlements.map((s) => (
            <div key={s.transactionId} className="flex items-center gap-2 text-xs text-slate-600">
              <span>{formatDay(s.date)}</span>
              <span className="flex-1">{s.amount > 0 ? `${partner} me pagó` : `Le pagué a ${partner}`} {formatMoney(Math.abs(s.amount))} · {accountName(s.accountId)}</span>
              <button className={iconBtnDanger} aria-label="Eliminar pago" onClick={() => confirm("¿Eliminar este pago?") && guard(() => delSettlement.mutateAsync(s.transactionId))}>✕</button>
            </div>
          ))}
          {m.pending > 0 && <p className="text-xs text-slate-500">Lo que te paga {partner} entra como reintegro y se descuenta de tu gasto.</p>}
        </section>
      )}

      {m.byKind.length > 0 && (
        <section className="rounded-xl bg-white shadow">
          {/* celular: una tarjeta por tipo */}
          <div className="divide-y sm:hidden">
            {m.byKind.map((k) => (
              <div key={k.kind} className="space-y-1.5 px-4 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{k.kind}</span>
                  <span className="tabular-nums">{formatMoney(k.total)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{k.pct.toLocaleString("es-AR")}% del mes</span><span>Mi parte <b className="font-medium text-slate-700">{formatMoney(k.myShare)}</b></span>
                </div>
                {kindSelect(k.kind, k.categoryId, "w-full")}
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2 font-normal">Tipo</th><th className="px-2 py-2 text-right font-normal">Total</th><th className="px-2 py-2 text-right font-normal">% del mes</th><th className="px-2 py-2 text-right font-normal">Mi parte</th><th className="px-4 py-2 font-normal">Va a mi categoría</th></tr>
              </thead>
              <tbody className="divide-y">
                {m.byKind.map((k) => (
                  <tr key={k.kind}>
                    <td className="px-4 py-2">{k.kind}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(k.total)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">{k.pct.toLocaleString("es-AR")}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatMoney(k.myShare)}</td>
                    <td className="px-4 py-1.5">{kindSelect(k.kind, k.categoryId, "w-full min-w-36")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="divide-y rounded-xl bg-white shadow">
        {m.entries.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No hay gastos compartidos este mes. {config.sourceUrl ? "Sincronizá" : "Subí el CSV de respuestas"} para traerlos.</p>
        )}
        {m.entries.map((e) => (
          <div key={e.id} className="flex items-start gap-3 py-2 pl-4 pr-2">
            <span className="w-10 shrink-0 pt-0.5 text-xs text-slate-500">{formatDay(e.date)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 pr-2">
                <span className="truncate text-sm">{e.description || e.kind}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(e.amount)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span className={`rounded-full px-2 py-0.5 ${e.payer === "ME" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>
                  {e.payer === "ME" ? config.meName : partner}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.kind}{e.source === "MANUAL" && " · cargado acá"}</span>
                <button className={`${iconBtnDanger} -my-1`} aria-label="Eliminar gasto"
                  title={e.source === "FORM" ? "Lo ignora: no vuelve a importarse" : "Eliminar"}
                  onClick={() => confirm(e.source === "FORM" ? "¿Ignorar este gasto? No se vuelve a importar aunque siga en la planilla." : "¿Eliminar este gasto?") && guard(() => delEntry.mutateAsync(e.id))}>✕</button>
              </div>
              {e.payer === "ME" && (
                <div className="mt-1 flex gap-2 pr-2 [&>select]:flex-1 sm:[&>select]:flex-none">
                  <select className={`${field} py-0.5 text-xs sm:max-w-48`} value={methodOf(e)} aria-label="Cómo lo pagué" onChange={(ev) => changeMethod(e, ev.target.value)}>
                    <option value="">{config.defaultAccountId ? `${accountName(config.defaultAccountId)} (por defecto)` : "Sin cuenta"}</option>
                    {accounts.filter((a) => a.id !== config.defaultAccountId).map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}
                    {cards.map((c) => <option key={c.id} value={`card:${c.id}`}>Tarjeta {c.name}</option>)}
                  </select>
                  {e.cardId && (
                    <select className={`${field} py-0.5 text-xs`} value={e.installmentCount} aria-label="Cuotas"
                      onChange={(ev) => guard(() => patchEntry.mutateAsync({ id: e.id, patch: { installmentCount: Number(ev.target.value) } }))}>
                      {[1, 2, 3, 4, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? "1 pago" : `${n} cuotas`}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
