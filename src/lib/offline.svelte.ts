/**
 * Trabajar sin internet.
 *
 * Todo cambio va primero a la cola del teléfono (`outbox`) y se ve al
 * instante; después se envía a PocketBase en orden, cuando haya conexión:
 * al abrir la app, al volver la red, al volver a la pestaña y cada 30 s
 * mientras quede algo. Un solo envío a la vez, también entre pestañas.
 *
 * Con la sesión vencida no se envía ni se pide nada: PocketBase trata un
 * token vencido como visitante y respondería listas vacías y errores que no
 * son, así que se espera a que la persona entre de nuevo. La cola nunca se
 * borra por eso.
 */
import { ClientResponseError } from "pocketbase";

import * as local from "./local";
import { notify } from "./notify.svelte";
import {
  balanceDelta,
  classify,
  coalesce,
  fatalMessage,
  keyOf,
  newId,
  type Op,
  type OutboxItem,
} from "./outbox";
import { errorMessage, pb } from "./pb.svelte";

const TIMEOUT = 20_000;
const RETRY_EVERY = 30_000;

let items = $state<OutboxItem[]>([]);
let online = $state(typeof navigator === "undefined" ? true : navigator.onLine);
/** `navigator.onLine` dice que hay red aunque el servidor no responda: esto es lo que vimos. */
let reachable = $state(true);
let syncing = $state(false);
let authNeeded = $state(false);
const delta = $derived(balanceDelta(items.filter((i) => !i.error)));

let owner = "";
/** El que se está enviando: con ese ya no se junta nada. */
let inflight: number | null = null;
let onSent = () => {};
let timer: number | undefined;

export function isNetworkError(err: unknown) {
  return err instanceof ClientResponseError && err.status === 0;
}

/** Se puede hablar con el servidor en nombre de la persona. */
function canTalk() {
  if (!pb.authStore.isValid) {
    authNeeded = true;
    return false;
  }
  authNeeded = false;
  return true;
}

async function refresh() {
  try {
    items = (await local.allOutbox()).filter((i) => i.owner === owner);
  } catch {
    items = [];
  }
}

/** Lo que se guarda como "antes": sin lo que añade la pantalla. */
function strip(r: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!k.startsWith("_") && k !== "expand") out[k] = v;
  return out;
}

async function mutate(op: Op, collection: string, id: string, data?: Record<string, unknown>, base?: object | null) {
  const item: OutboxItem = {
    key: keyOf(collection, id),
    owner,
    op,
    collection,
    id,
    data,
    base: base ? strip(base as Record<string, unknown>) : null,
    at: new Date().toISOString(),
  };
  await local.withOutbox(item.key, (pending, store) => {
    const prev = pending.at(-1);
    const merged = prev && prev.seq !== inflight ? coalesce(prev, item) : null;
    if (!merged) store.add(item);
    else if ("drop" in merged) store.remove(prev!.seq!);
    else store.put(merged.put);
  });
  await refresh();
  void sync();
}

function send(i: OutboxItem) {
  const c = pb.collection(i.collection);
  const opts = { signal: AbortSignal.timeout(TIMEOUT) };
  if (i.op === "create") return c.create({ ...i.data, id: i.id }, opts);
  if (i.op === "update") return c.update(i.id, i.data ?? {}, opts);
  return c.delete(i.id, opts);
}

async function run() {
  if (!owner || !navigator.onLine || !canTalk()) return;
  syncing = true;
  let sent = 0;
  try {
    for (;;) {
      if (!canTalk()) break;
      const next = (await local.allOutbox()).find((i) => i.owner === owner && !i.error);
      if (!next) break;
      inflight = next.seq!;
      let outcome: ReturnType<typeof classify> = "done";
      let err: unknown;
      try {
        await send(next);
      } catch (e) {
        err = e;
        outcome = classify(next, e);
      } finally {
        inflight = null;
      }

      if (outcome === "done") {
        reachable = true;
        await local.removeOutbox(next.seq!);
        sent++;
      } else if (outcome === "retry") {
        if (isNetworkError(err)) reachable = false;
        break;
      } else if (outcome === "auth") {
        authNeeded = true;
        break;
      } else {
        reachable = true;
        const error = fatalMessage(next, err, errorMessage(err));
        await local.putOutbox({ ...next, error });
        notify.fail(new Error(`No se pudo guardar un cambio: ${error}`));
      }
      await refresh();
    }
  } finally {
    syncing = false;
    await refresh();
    if (sent) onSent();
  }
}

let running: Promise<void> | null = null;

/** Enviar lo pendiente. Si ya se está enviando, espera a ese envío. */
export function sync(): Promise<void> {
  running ??= (async () => {
    try {
      if (navigator.locks) await navigator.locks.request("finanzas-outbox", run);
      else await run();
    } catch {
      // Un fallo de IndexedDB no debe tumbar la app: se intenta de nuevo luego.
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Una lista con copia en el teléfono: primero muestra lo último guardado (si
 * hay) y luego lo del servidor, que queda guardado para la próxima vez. Sin
 * red se queda con la copia.
 */
export async function cachedList<T>(key: string, fetch: () => Promise<T[]>, show: (list: T[]) => void) {
  const k = `${owner}:${key}`;
  const saved = owner ? await local.readSnap<T[]>(k) : undefined;
  if (saved) show(saved);
  if (!canTalk()) {
    if (!saved) show([]);
    return;
  }
  try {
    const fresh = await fetch();
    reachable = true;
    show(fresh);
    if (owner) void local.writeSnap(k, fresh);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    reachable = false;
    if (!saved) show([]);
  }
}

function onOnline() {
  online = true;
  reachable = true;
  void sync();
}

function onOffline() {
  online = false;
}

function onVisible() {
  if (document.visibilityState === "visible") void sync();
}

export async function startOffline(userId: string, sentHook: () => void) {
  owner = userId;
  onSent = sentHook;
  online = navigator.onLine;
  addEventListener("online", onOnline);
  addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  timer = window.setInterval(() => {
    if (items.some((i) => !i.error)) void sync();
  }, RETRY_EVERY);
  // Pedir que el navegador no borre los datos cuando le falte espacio.
  void navigator.storage?.persist?.().catch(() => {});
  await refresh();
  void sync();
}

export function stopOffline() {
  removeEventListener("online", onOnline);
  removeEventListener("offline", onOffline);
  document.removeEventListener("visibilitychange", onVisible);
  clearInterval(timer);
  owner = "";
  items = [];
}

/** El servidor respondió (o no): lo usa el resto de la app para el aviso de conexión. */
export function seen(ok: boolean) {
  reachable = ok;
}

export const offline = {
  /** Hay red y el servidor responde. */
  get online() {
    return online && reachable;
  },
  get syncing() {
    return syncing;
  },
  /** La sesión venció: hay que entrar de nuevo para enviar. */
  get authNeeded() {
    return authNeeded;
  },
  get items() {
    return items;
  },
  /** Cuántos cambios esperan para enviarse. */
  get pending() {
    return items.filter((i) => !i.error).length;
  },
  /** Los que el servidor rechazó: la persona decide si reintentar o descartar. */
  get failed() {
    return items.filter((i) => i.error);
  },
  /** Cuánto mueve lo pendiente el saldo de una cuenta. */
  delta(account: string) {
    return delta[account] ?? 0;
  },
  /** Crear con id propio: el id es lo que evita duplicar al reintentar. */
  async create(collection: string, data: Record<string, unknown>) {
    const id = newId();
    await mutate("create", collection, id, data, null);
    return id;
  },
  /** `base`: el registro como se ve ahora (para saldos y listas mientras tanto). */
  update(collection: string, id: string, data: Record<string, unknown>, base: object) {
    return mutate("update", collection, id, data, base);
  },
  remove(collection: string, id: string, base: object) {
    return mutate("delete", collection, id, undefined, base);
  },
  async retry(seq: number) {
    const item = items.find((i) => i.seq === seq);
    if (!item) return;
    await local.putOutbox({ ...item, error: undefined });
    await refresh();
    await sync();
  },
  async discard(seq: number) {
    await local.removeOutbox(seq);
    await refresh();
    onSent();
  },
  sync,
};
