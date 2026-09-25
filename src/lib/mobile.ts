/**
 * Piezas pequeñas de la vista del celular: nombres de los días y cómo se
 * llama un movimiento en una lista.
 */
import { dayOf } from "./finance";
import { store } from "./store.svelte";
import { tagLabel, tagsOf } from "./tags";
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
