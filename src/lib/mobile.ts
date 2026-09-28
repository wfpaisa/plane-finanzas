/**
 * Piezas pequeñas de la vista del celular: nombres de los días y cómo se
 * llama un movimiento en una lista.
 */
import { addMonths, dayOf, today, weekStart, ymd } from "./finance";
import { dateYmd, monthYm, plainNumber } from "./format";
import { store } from "./store.svelte";
import { hasTag, tagsOf } from "./tags";
import type { Transaction } from "./types";

export const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** 0 = domingo … 6 = sábado. */
export function weekday(s: string): number {
  const [y, m, d] = dayOf(s).split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** "2026-09-20" -> "09.2026" */
export const monthDot = (s: string) => `${s.slice(5, 7)}.${s.slice(0, 4)}`;

/** "2026-09-20" -> "20.9" */
export const dayDot = (s: string) => `${Number(s.slice(8, 10))}.${Number(s.slice(5, 7))}`;

/** "Bancolombia" o "Bancolombia → Nequi". */
export function accountLine(t: Transaction): string {
  const from = store.account(t.account)?.name ?? "";
  if (t.type !== "transfer") return from;
  return `${from} → ${store.account(t.to_account)?.name ?? "?"}`;
}

/**
 * Si lo buscado es un monto ("15000", "$15.000", "15,000"), si el del
 * movimiento empieza así. Con puntos se compara escrito igual que en la app
 * ("5.000" no encuentra 50.000); sin ellos, solo las cifras ("5000" sí).
 */
function amountMatches(amount: number, s: string): boolean {
  const q = s.replace(/[$\s]/g, "").replaceAll(",", ".");
  if (!/^\d[\d.]*$/.test(q)) return false;
  const n = Math.round(Math.abs(amount));
  return q.includes(".") ? plainNumber(n).startsWith(q) : String(n).startsWith(q);
}

/** Si el movimiento tiene lo buscado: en sus textos, su cuenta, sus etiquetas o su monto. */
export function matches(t: Transaction, text: string): boolean {
  const s = text.trim().toLowerCase();
  if (!s) return true;
  if (amountMatches(t.amount, s)) return true;
  return [
    t.description,
    t.notes,
    store.category(t.category)?.name,
    store.account(t.account)?.name,
    store.account(t.to_account)?.name,
    ...tagsOf(t),
  ].some((x) => x?.toLowerCase().includes(s));
}

export const sumOf = (txs: readonly Transaction[], type: string) =>
  txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

// ---------------------------------------------------------------------------
// El buscador: texto, periodo y filtros que se combinan (todos deben cumplirse;
// dentro de un mismo filtro, basta con uno de los elegidos).
// ---------------------------------------------------------------------------

export type Period = "all" | "week" | "month" | "year" | "range";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensual" },
  { id: "year", label: "Anual" },
  { id: "range", label: "Rango" },
];

export interface TxFilters {
  text: string;
  period: Period;
  /** Un día dentro del periodo que se mira; en un rango, el primero. */
  ref: string;
  /** En un rango, el último día (incluido). */
  to: string;
  types: string[];
  accounts: string[];
  categories: string[];
  tags: string[];
}

export const emptyFilters = (): TxFilters => ({
  text: "",
  period: "all",
  ref: today(),
  to: today(),
  types: [],
  accounts: [],
  categories: [],
  tags: [],
});

const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
};

/** [desde, hasta) del periodo, o `null` si es "Todos". `to`: el último día de un rango. */
export function periodRange(p: Period, ref: string, to = ref): [string, string] | null {
  if (p === "range") return [ref, addDays(to, 1)];
  if (p === "week") {
    const from = weekStart(ref);
    return [from, addDays(from, 7)];
  }
  if (p === "month") {
    const ym = ref.slice(0, 7);
    return [`${ym}-01`, `${addMonths(ym, 1)}-01`];
  }
  if (p === "year") {
    const y = Number(ref.slice(0, 4));
    return [`${y}-01-01`, `${y + 1}-01-01`];
  }
  return null;
}

/** Corre el periodo `n` pasos (semanas, meses o años); un rango no se mueve. */
export function shiftPeriod(p: Period, ref: string, n: number): string {
  if (p === "week") return addDays(ref, 7 * n);
  if (p === "month") return `${addMonths(ref.slice(0, 7), n)}-01`;
  if (p === "year") return `${Number(ref.slice(0, 4)) + n}-01-01`;
  return ref;
}

/** Con el año primero, como las fechas: "2026 · Septiembre", "2026/09/21 – 2026/09/27". */
export function periodLabel(p: Period, ref: string, to = ref): string {
  if (p === "week") {
    const from = weekStart(ref);
    return `${dateYmd(from)} – ${dateYmd(addDays(from, 6))}`;
  }
  if (p === "range") return `${dateYmd(ref)} – ${dateYmd(to)}`;
  if (p === "month") return monthYm(ref.slice(0, 7));
  if (p === "year") return ref.slice(0, 4);
  return "Todos";
}

/** Cuántos filtros hay puestos, sin contar el texto. */
export const filterCount = (f: TxFilters) =>
  (f.period !== "all" ? 1 : 0) + f.types.length + f.accounts.length + f.categories.length + f.tags.length;

export function passes(t: Transaction, f: TxFilters): boolean {
  const range = periodRange(f.period, f.ref, f.to);
  const d = t.date.slice(0, 10);
  return (
    (!range || (d >= range[0] && d < range[1])) &&
    (!f.types.length || f.types.includes(t.type)) &&
    (!f.accounts.length || f.accounts.includes(t.account) || (!!t.to_account && f.accounts.includes(t.to_account))) &&
    (!f.categories.length || f.categories.includes(t.category)) &&
    (!f.tags.length || f.tags.some((tag) => hasTag(t, tag))) &&
    matches(t, f.text)
  );
}

// ---------------------------------------------------------------------------
// Las mismas secciones que en escritorio: cada pantalla de escritorio tiene
// su lugar en la app del teléfono, y un enlace a ella lleva allá.
// ---------------------------------------------------------------------------

/** Las pestañas de abajo, en el orden del menú de escritorio. */
export type Tab = "resumen" | "movimientos" | "cuentas" | "analisis" | "mas";

/** Lo que va en `#/m?…` para abrir la pantalla de escritorio `path`. */
export function mobileHash(path: string, query: URLSearchParams): string | undefined {
  // La subpantalla primero; los filtros de la dirección de escritorio, detrás.
  const with_ = (ver: string) => {
    const q = new URLSearchParams({ ver });
    for (const [k, v] of query) if (k !== "ver") q.set(k, v);
    return `#/m?${q}`;
  };
  const tab = (t: Tab) => `#/m?pestana=${t}`;
  switch (path) {
    case "/":
      return tab("resumen");
    // Con filtros (una cuenta, una etiqueta…), el buscador; si no, el diario.
    case "/movimientos":
      return query.size ? with_("buscar") : tab("movimientos");
    // Administrar cuentas: la pantalla completa, encima de Cuentas.
    case "/cuentas":
      return with_("cuentas");
    case "/estados":
      return tab("analisis");
    case "/correos":
      return with_("correos");
    case "/ahorros":
      return with_("ahorros");
    case "/proyeccion":
      return with_("plan");
    case "/ajustes":
      return with_("ajustes");
  }
}

/** Los filtros del buscador que trae una dirección de escritorio (`?cuenta=…&tag=…`). */
export function filtersFrom(query: URLSearchParams): TxFilters | null {
  const account = query.get("cuenta");
  const category = query.get("cat");
  const tag = query.get("tag");
  if (!account && !category && !tag) return null;
  const month = query.get("mes");
  return {
    ...emptyFilters(),
    accounts: account ? [account] : [],
    categories: category ? [category] : [],
    tags: tag ? [tag] : [],
    // `mes=todo` es sin periodo; un `mes=2026-09`, ese mes.
    ...(month && /^\d{4}-\d{2}$/.test(month) ? { period: "month" as const, ref: `${month}-01` } : {}),
  };
}
