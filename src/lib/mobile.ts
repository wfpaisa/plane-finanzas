/**
 * Piezas pequeñas de la vista del celular: nombres de los días y cómo se
 * llama un movimiento en una lista.
 */
import { addMonths, dayOf, today, weekStart, ymd } from "./finance";
import { dateShort, monthLabel } from "./format";
import { store } from "./store.svelte";
import { hasTag, tagLabel, tagsOf } from "./tags";
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

/** Las dos líneas de la columna izquierda: las etiquetas de la categoría y su nombre, o solo el nombre. */
export function leftLabel(t: Transaction): [string, string] {
  if (t.type === "transfer") return ["Transferencia", ""];
  const cat = store.category(t.category);
  if (!cat) return ["Sin categoría", ""];
  const tags = cat.tags ?? [];
  return tags.length ? [tags.map(tagLabel).join(" · "), cat.name] : [cat.name, ""];
}

/** "Bancolombia" o "Bancolombia → Nequi". */
export function accountLine(t: Transaction): string {
  const from = store.account(t.account)?.name ?? "";
  if (t.type !== "transfer") return from;
  return `${from} → ${store.account(t.to_account)?.name ?? "?"}`;
}

export function matches(t: Transaction, text: string): boolean {
  const s = text.trim().toLowerCase();
  if (!s) return true;
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

export type Period = "all" | "week" | "month" | "year";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensual" },
  { id: "year", label: "Anual" },
];

export interface TxFilters {
  text: string;
  period: Period;
  /** Un día dentro del periodo que se mira. */
  ref: string;
  types: string[];
  accounts: string[];
  categories: string[];
  tags: string[];
}

export const emptyFilters = (): TxFilters => ({
  text: "",
  period: "all",
  ref: today(),
  types: [],
  accounts: [],
  categories: [],
  tags: [],
});

const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
};

/** [desde, hasta) del periodo, o `null` si es "Todos". */
export function periodRange(p: Period, ref: string): [string, string] | null {
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

/** Corre el periodo `n` pasos (semanas, meses o años). */
export function shiftPeriod(p: Period, ref: string, n: number): string {
  if (p === "week") return addDays(ref, 7 * n);
  if (p === "month") return `${addMonths(ref.slice(0, 7), n)}-01`;
  if (p === "year") return `${Number(ref.slice(0, 4)) + n}-01-01`;
  return ref;
}

export function periodLabel(p: Period, ref: string): string {
  if (p === "week") {
    const from = weekStart(ref);
    return `${dateShort(from)} – ${dateShort(addDays(from, 6))}`;
  }
  if (p === "month") return monthLabel(ref.slice(0, 7), true);
  if (p === "year") return ref.slice(0, 4);
  return "Todos";
}

/** Cuántos filtros hay puestos, sin contar el texto. */
export const filterCount = (f: TxFilters) =>
  (f.period !== "all" ? 1 : 0) + f.types.length + f.accounts.length + f.categories.length + f.tags.length;

export function passes(t: Transaction, f: TxFilters): boolean {
  const range = periodRange(f.period, f.ref);
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
