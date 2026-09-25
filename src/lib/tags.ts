/**
 * Etiquetas: las de cada movimiento y las de su categoría.
 *
 * Una categoría puede llevar etiquetas ("fijo", "hogar", "negocio"…) y todo
 * movimiento de esa categoría las hereda. Los filtros y las cuentas por
 * etiqueta miran las dos a la vez: la propia del movimiento y la heredada.
 * Un movimiento con varias etiquetas suma en cada una, así que las sumas por
 * etiqueta no tienen por qué dar el total.
 */
import { store } from "./store.svelte";
import type { Transaction } from "./types";

/** Lo que se paga igual cada mes: la etiqueta que el móvil cuenta como "Fijos". */
export const FIXED_TAG = "fijo";

/** Como las escribe `TagInput`: minúsculas, sin espacios de sobra ni comas. */
export const normTag = (raw: string) => raw.trim().toLowerCase().replace(/,/g, "");

/** Las etiquetas de una categoría. */
export const catTags = (categoryId: string): string[] => store.category(categoryId)?.tags ?? [];

/** Las del movimiento y las de su categoría, sin repetir. */
export function tagsOf(t: Pick<Transaction, "category" | "tags">): string[] {
  const own = t.tags ?? [];
  const inherited = catTags(t.category);
  if (!inherited.length) return own;
  return [...new Set([...own, ...inherited])];
}

export const hasTag = (t: Pick<Transaction, "category" | "tags">, tag: string) => tagsOf(t).includes(tag);

/** Las etiquetas puestas en alguna categoría, en orden alfabético. */
export const categoryTags = () => [...new Set(store.categories.flatMap((c) => c.tags ?? []))].sort();

/** "fijo" -> "Fijo". */
export const tagLabel = (tag: string) => (tag ? tag[0].toUpperCase() + tag.slice(1) : tag);

/**
 * Suma por etiqueta. Cada movimiento suma en cada una de las suyas y, si no
 * tiene ninguna, en la clave vacía.
 */
export function byTag(txs: readonly Pick<Transaction, "category" | "tags" | "amount">[]) {
  const map = new Map<string, { tag: string; total: number; count: number }>();
  for (const t of txs) {
    const list = tagsOf(t);
    for (const tag of list.length ? list : [""]) {
      const row = map.get(tag) ?? { tag, total: 0, count: 0 };
      row.total += t.amount;
      row.count++;
      map.set(tag, row);
    }
  }
  return [...map.values()].toSorted((a, b) => b.total - a.total);
}
