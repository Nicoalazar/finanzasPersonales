import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from "react";

/**
 * Valor "canónico" del campo: dígitos con coma decimal y sin separador de miles ("1234567,5").
 * Es lo que guarda el estado y lo que entiende `Number(s.replace(",", "."))`.
 */
export function toCanonical(raw: string): string {
  const neg = raw.trimStart().startsWith("-");
  const body = raw.replace(/[^\d,]/g, "");
  const i = body.indexOf(",");
  const out = i < 0 ? body : `${body.slice(0, i)},${body.slice(i + 1).replace(/,/g, "")}`;
  return neg ? `-${out}` : out;
}

/** Canónico → "1.234.567,5". Un valor con "." y sin "," viene de `String(número)` y su punto es decimal. */
export function maskNumber(value: string): string {
  const canon = toCanonical(value.includes(",") ? value : value.replace(".", ","));
  const neg = canon.startsWith("-");
  const [int = "", dec] = canon.replace("-", "").split(",");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${grouped}${dec === undefined ? "" : `,${dec}`}`;
}

const significant = (s: string) => s.replace(/[^\d,-]/g, "").length;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  /** Recibe el valor canónico (coma decimal, sin separador de miles). */
  onChange: (value: string) => void;
};

/** Input numérico con máscara de millares mientras se escribe: 1234567,5 → 1.234.567,5 */
export function NumberInput({ value, onChange, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const shown = maskNumber(value);

  // tras formatear, el cursor vuelve al mismo lugar contando solo dígitos, coma y signo
  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current === null || !el) return;
    let seen = 0, pos = 0;
    while (pos < shown.length && seen < caret.current) {
      if (/[\d,-]/.test(shown[pos]!)) seen++;
      pos++;
    }
    if (document.activeElement === el) el.setSelectionRange(pos, pos);
    caret.current = null;
  });

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    const at = e.target.selectionStart ?? raw.length;
    // teclado con punto decimal: el "." recién tipeado se toma como coma (los demás puntos son los miles)
    if ((e.nativeEvent as InputEvent).data === "." && raw[at - 1] === ".") raw = `${raw.slice(0, at - 1)},${raw.slice(at)}`;
    caret.current = significant(raw.slice(0, at));
    onChange(toCanonical(raw));
  };

  return <input {...rest} ref={ref} type="text" inputMode="decimal" value={shown} onChange={handle} />;
}
