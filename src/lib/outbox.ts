/**
 * La cola de cambios pendientes, sin nada de navegador: qué guardar, cómo
 * juntar cambios seguidos, cómo se ve la lista con lo pendiente encima y qué
 * hacer con cada respuesta del servidor. `offline.svelte.ts` la pone a andar.
 *
 * Lo que evita duplicados: cada registro nuevo nace con su id en el teléfono.
 * Si el envío llegó pero la respuesta se perdió, el reintento choca con "ese
 * id ya existe" y se da por hecho. Por eso todo cambio es repetible: crear
 * con id fijo, editar con valores finales (nunca "+5"), borrar lo que ya no
 * está.
 */
import { ClientResponseError } from "pocketbase";

export type Op = "create" | "update" | "delete";
type Data = Record<string, unknown>;

export interface OutboxItem {
  /** Autoincremental: el orden de envío. */
  seq?: number;
  /** `colección/id`: para encontrar lo pendiente de un registro. */
  key: string;
  owner: string;
  op: Op;
  collection: string;
  id: string;
  data?: Data;
  /** Cómo estaba el registro en el servidor antes del primer cambio (para saldos y listas). */
  base?: Data | null;
  /** Error que no se arregla reintentando: la persona decide. */
  error?: string;
  at: string;
}

/** Un id como los de PocketBase: 15 caracteres [a-z0-9]. */
export function newId(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  // 252 = 36 × 7: descartar lo de arriba evita que unas letras salgan más.
  let out = "";
  while (out.length < 15) {
    for (const b of crypto.getRandomValues(new Uint8Array(20))) {
      if (b < 252 && out.length < 15) out += abc[b % 36];
    }
  }
  return out;
}

export const keyOf = (collection: string, id: string) => `${collection}/${id}`;

/**
 * Juntar un cambio nuevo con lo que ya estaba pendiente para ese registro.
 * - `null`: agregarlo tal cual.
 * - `{ put }`: reemplazar el pendiente por este.
 * - `{ drop }`: quitar el pendiente y no agregar nada (se creó y se borró sin salir).
 */
export function coalesce(prev: OutboxItem, next: OutboxItem): { put: OutboxItem } | { drop: true } | null {
  if (prev.error) return null;
  if (prev.op === "create" && next.op === "update") {
    return { put: { ...prev, data: { ...prev.data, ...next.data } } };
  }
  if (prev.op === "create" && next.op === "delete") return { drop: true };
  if (prev.op === "update" && next.op === "update") {
    return { put: { ...prev, data: { ...prev.data, ...next.data } } };
  }
  if (prev.op === "update" && next.op === "delete") {
    return { put: { ...prev, op: "delete", data: undefined } };
  }
  return null;
}

/** Aplicar una cadena de cambios a un registro (null: no existe). */
function fold(start: Data | null, items: OutboxItem[]): Data | null {
  let cur = start;
  for (const i of items) {
    if (i.op === "create") cur = { ...i.data, id: i.id };
    else if (i.op === "update") cur = cur ? { ...cur, ...i.data } : null;
    else cur = null;
  }
  return cur;
}

function byKey(items: OutboxItem[], collection: string) {
  const groups = new Map<string, OutboxItem[]>();
  for (const i of items) {
    if (i.collection !== collection) continue;
    groups.set(i.id, [...(groups.get(i.id) ?? []), i]);
  }
  return groups;
}

export type Pending<T> = T & { _pending?: true; _error?: string };

/**
 * La lista del servidor con lo pendiente encima: lo nuevo aparece, lo editado
 * cambia y lo borrado se va. `keep` dice si un registro va en esta lista (el
 * mes que se está viendo, por ejemplo): uno editado puede entrar o salir.
 */
export function overlay<T extends { id: string }>(
  collection: string,
  list: T[],
  items: OutboxItem[],
  keep: (r: T) => boolean,
): Pending<T>[] {
  const out = new Map<string, Pending<T>>(list.map((r) => [r.id, r]));
  for (const [id, chain] of byKey(items, collection)) {
    const start = (out.get(id) as Data | undefined) ?? chain[0].base ?? null;
    const end = fold(start, chain);
    out.delete(id);
    if (!end) continue;
    const error = chain.find((i) => i.error)?.error;
    const rec = {
      created: chain[0].at,
      ...end,
      _pending: true,
      ...(error ? { _error: error } : {}),
    } as unknown as Pending<T>;
    if (keep(rec)) out.set(id, rec);
  }
  return [...out.values()];
}

interface TxShape {
  type?: string;
  amount?: number;
  account?: string;
  to_account?: string;
}

function effect(t: TxShape | null, into: Record<string, number>, sign: 1 | -1) {
  if (!t || !t.account) return;
  const amount = Number(t.amount) || 0;
  const add = (acc: string, v: number) => (into[acc] = (into[acc] ?? 0) + sign * v);
  if (t.type === "income") add(t.account, amount);
  else add(t.account, -amount);
  if (t.type === "transfer" && t.to_account) add(t.to_account, amount);
}

/**
 * Cuánto mueve lo pendiente el saldo de cada cuenta: la misma cuenta que
 * hace la vista `account_balances`, con el antes y el después de cada
 * registro.
 */
export function balanceDelta(items: OutboxItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const chain of byKey(items, "transactions").values()) {
    const before = chain[0].base ?? null;
    effect(before as TxShape | null, out, -1);
    effect(fold(before, chain) as TxShape | null, out, 1);
  }
  return out;
}

export type Outcome = "done" | "retry" | "auth" | "fatal";

/** Qué hacer con la respuesta del servidor a un envío fallido. */
export function classify(item: Pick<OutboxItem, "op">, err: unknown): Outcome {
  if (!(err instanceof ClientResponseError)) return "retry";
  const s = err.status;
  // Sin red, se cortó por tiempo, o el servidor está caído: otra vez luego.
  if (s === 0 || s === 429 || s >= 500) return "retry";
  if (s === 401) return "auth";
  // El envío anterior sí había llegado: justo el duplicado que se evita.
  const data = err.response?.data as Record<string, { code?: string }> | undefined;
  if (item.op === "create" && s === 400 && data?.id?.code === "validation_not_unique") return "done";
  // Borrar lo que ya no está: el resultado es el buscado.
  if (item.op === "delete" && s === 404) return "done";
  return "fatal";
}

/** El mensaje para lo que no se pudo enviar. */
export function fatalMessage(item: Pick<OutboxItem, "op">, err: unknown, fallback: string): string {
  if (item.op === "update" && err instanceof ClientResponseError && err.status === 404) {
    return "Se borró en otro dispositivo antes de que llegara este cambio.";
  }
  return fallback;
}
