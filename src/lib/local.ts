/**
 * Lo que se guarda en el teléfono (IndexedDB): la cola de cambios pendientes
 * (`outbox`) y la última copia de lo que llegó del servidor (`snap`), para
 * abrir la app sin internet.
 *
 * Todo pasa por JSON antes de guardarse: IndexedDB no acepta los proxies de
 * `$state`.
 */
import type { OutboxItem } from "./outbox";

const NAME = "finanzas";
const VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const outbox = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      outbox.createIndex("key", "key");
      db.createObjectStore("snap");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- Copias del servidor ----------

export async function readSnap<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await done(db.transaction("snap").objectStore("snap").get(key));
  } catch {
    // Sin IndexedDB (navegación privada, por ejemplo) la app funciona igual, solo que sin copia.
    return undefined;
  }
}

export async function writeSnap(key: string, value: unknown) {
  try {
    const db = await open();
    await done(db.transaction("snap", "readwrite").objectStore("snap").put(plain(value), key));
  } catch {}
}

/** Borra las copias de un usuario (al salir). La cola se queda: es trabajo sin enviar. */
export async function clearSnaps(prefix: string) {
  try {
    const db = await open();
    const store = db.transaction("snap", "readwrite").objectStore("snap");
    await done(store.delete(IDBKeyRange.bound(prefix, prefix + "￿")));
  } catch {}
}

// ---------- La cola ----------

export async function allOutbox(): Promise<OutboxItem[]> {
  const db = await open();
  return done(db.transaction("outbox").objectStore("outbox").getAll());
}

/**
 * Cambia la cola de forma atómica: `fn` recibe lo pendiente para `key` y el
 * almacén, dentro de una sola transacción.
 */
export async function withOutbox(
  key: string,
  fn: (pending: OutboxItem[], store: { add(i: OutboxItem): void; put(i: OutboxItem): void; remove(seq: number): void }) => void,
) {
  const db = await open();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  const pending = await done(store.index("key").getAll(key));
  fn(pending, {
    add: (i) => store.add(plain(i)),
    put: (i) => store.put(plain(i)),
    remove: (seq) => store.delete(seq),
  });
  await finished(tx);
}

export async function putOutbox(item: OutboxItem) {
  const db = await open();
  await done(db.transaction("outbox", "readwrite").objectStore("outbox").put(plain(item)));
}

export async function removeOutbox(seq: number) {
  const db = await open();
  await done(db.transaction("outbox", "readwrite").objectStore("outbox").delete(seq));
}
