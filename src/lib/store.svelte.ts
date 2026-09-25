/**
 * Lo que la app tiene en memoria: cuentas, saldos, categorías, ahorros y
 * fijos. Son pocos registros por usuario, así que se cargan todos al entrar y
 * se recargan cuando PocketBase avisa de un cambio (tiempo real). Las
 * transacciones no: esas se piden por rango en cada pantalla.
 *
 * Una copia queda en el teléfono: al entrar sin internet la app abre con
 * ella, y los saldos suman lo que falta por enviar (ver offline.svelte.ts).
 */
import { readSnap, writeSnap } from "./local";
import { notify } from "./notify.svelte";
import { isNetworkError, offline, seen, startOffline, stopOffline } from "./offline.svelte";
import { pb, reauth, session } from "./pb.svelte";
import type {
  Account,
  Balance,
  Category,
  GmailConnection,
  Recurring,
  Saving,
  SavingMovement,
} from "./types";

let accounts = $state<Account[]>([]);
let balances = $state<Record<string, number>>({});
let categories = $state<Category[]>([]);
let savings = $state<Saving[]>([]);
let movements = $state<SavingMovement[]>([]);
let recurring = $state<Recurring[]>([]);
let gmail = $state<GmailConnection | null>(null);
let loaded = $state(false);
/** Sube con cada cambio en transacciones: las pantallas lo leen para recargar. */
let txVersion = $state(0);

async function loadAccounts() {
  const [a, b] = await Promise.all([
    pb.collection("accounts").getFullList<Account>({ sort: "sort,created" }),
    pb.collection("account_balances").getFullList<Balance>(),
  ]);
  accounts = a;
  balances = Object.fromEntries(b.map((x) => [x.id, x.balance ?? 0]));
}

async function loadCategories() {
  categories = await pb.collection("categories").getFullList<Category>({ sort: "kind,name" });
}

async function loadSavings() {
  const [s, m] = await Promise.all([
    pb.collection("savings").getFullList<Saving>({ sort: "created", expand: "members,owner" }),
    pb.collection("saving_movements").getFullList<SavingMovement>({ sort: "-date,-created" }),
  ]);
  savings = s;
  movements = m;
}

async function loadRecurring() {
  recurring = await pb.collection("recurring").getFullList<Recurring>({ sort: "kind,-amount" });
}

async function loadGmail() {
  const list = await pb.collection("gmail_connections").getFullList<GmailConnection>();
  gmail = list[0] ?? null;
}

const loaders = {
  accounts: loadAccounts,
  categories: loadCategories,
  savings: loadSavings,
  recurring: loadRecurring,
  gmail: loadGmail,
};

export type Part = keyof typeof loaders;

interface Snapshot {
  accounts: Account[];
  balances: Record<string, number>;
  categories: Category[];
  savings: Saving[];
  movements: SavingMovement[];
  recurring: Recurring[];
}

const snapKey = () => `${session.id}:store`;

export async function reload(...parts: Part[]) {
  // Con la sesión vencida PocketBase responde listas vacías: mejor no preguntar.
  if (!pb.authStore.isValid) return;
  const list = parts.length ? parts : (Object.keys(loaders) as Part[]);
  await Promise.all(list.map((p) => loaders[p]()));
  seen(true);
  const snap: Snapshot = { accounts, balances, categories, savings, movements, recurring };
  void writeSnap(snapKey(), snap);
}

/** Recargar sin que un fallo de red moleste: se queda lo que había. */
function refresh(...parts: Part[]) {
  return reload(...parts).catch((err) => {
    if (isNetworkError(err)) seen(false);
    else notify.fail(err);
  });
}

// Varios avisos seguidos (una sincronización de Gmail crea decenas) se juntan
// en una sola recarga.
const pending = new Set<Part>();
let timer: number | undefined;
function soon(part: Part) {
  pending.add(part);
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const parts = [...pending];
    pending.clear();
    void refresh(...parts);
  }, 250);
}

let unsub: (() => Promise<void>)[] = [];

async function subscribe() {
  if (unsub.length || !pb.authStore.isValid) return;
  const watch = async (collection: string, fn: () => void) => {
    try {
      unsub.push(await pb.collection(collection).subscribe("*", fn));
    } catch {
      // Sin tiempo real la app funciona igual: recarga tras cada cambio propio.
    }
  };
  await Promise.all([
    watch("transactions", () => {
      txVersion++;
      soon("accounts");
    }),
    watch("accounts", () => soon("accounts")),
    watch("categories", () => soon("categories")),
    watch("savings", () => soon("savings")),
    watch("saving_movements", () => soon("savings")),
    watch("recurring", () => soon("recurring")),
    watch("gmail_connections", () => soon("gmail")),
  ]);
}

// Al volver la red: lo que cambió mientras tanto, y el tiempo real si no estaba.
function onOnline() {
  void refresh().then(subscribe);
}

export async function start() {
  // Primero la cola, que así las pantallas ya saben de quién es lo guardado.
  await startOffline(session.id, touchTransactions);
  addEventListener("online", onOnline);
  const snap = await readSnap<Snapshot>(snapKey());
  if (snap) {
    ({ accounts, balances, categories, savings, movements, recurring } = snap);
    loaded = true;
  }

  if (!pb.authStore.isValid) {
    // Sesión vencida. Sin red se sigue con la copia; con red, a entrar de nuevo.
    if (navigator.onLine || !snap) reauth();
    return;
  }
  try {
    // Estirar la sesión mientras hay red, para que dure los días sin ella.
    await pb.collection("users").authRefresh();
    await reload();
  } catch (err) {
    if (err instanceof Error && "status" in err && (err.status === 401 || err.status === 403)) {
      reauth();
      return;
    }
    if (isNetworkError(err)) seen(false);
    else notify.fail(err);
  }
  loaded = true;
  await subscribe();
}

export async function stop() {
  removeEventListener("online", onOnline);
  stopOffline();
  await Promise.all(unsub.map((u) => u().catch(() => {})));
  unsub = [];
  loaded = false;
  accounts = [];
  categories = [];
  savings = [];
  movements = [];
  recurring = [];
  gmail = null;
}

/** Avisar a las pantallas de que las transacciones cambiaron. */
export function touchTransactions() {
  txVersion++;
  void refresh("accounts");
}

export const store = {
  get loaded() {
    return loaded;
  },
  get txVersion() {
    return txVersion;
  },
  get accounts() {
    return accounts;
  },
  get activeAccounts() {
    return accounts.filter((a) => !a.archived);
  },
  get categories() {
    return categories;
  },
  get savings() {
    return savings;
  },
  get activeSavings() {
    return savings.filter((s) => !s.archived);
  },
  get movements() {
    return movements;
  },
  get recurring() {
    return recurring;
  },
  get gmail() {
    return gmail;
  },
  /** El saldo del servidor más lo que falta por enviar. */
  balance(id: string) {
    return (balances[id] ?? 0) + offline.delta(id);
  },
  /** Todo lo que cuenta: cuentas activas que no están excluidas del total. */
  get total() {
    return accounts
      .filter((a) => !a.archived && !a.exclude_from_total)
      .reduce((s, a) => s + (balances[a.id] ?? 0) + offline.delta(a.id), 0);
  },
  account(id: string) {
    return accounts.find((a) => a.id === id);
  },
  category(id: string) {
    return categories.find((c) => c.id === id);
  },
  saving(id: string) {
    return savings.find((s) => s.id === id);
  },
  /** Lo que lleva un ahorro: la suma de sus movimientos. */
  savingCurrent(id: string) {
    return movements.filter((m) => m.saving === id).reduce((s, m) => s + m.amount, 0);
  },
  /** Cuánto de cada cuenta está apartado en ahorros. */
  earmarked(accountId: string) {
    return movements.filter((m) => m.account === accountId).reduce((s, m) => s + m.amount, 0);
  },
  isMine(ownerId: string) {
    return ownerId === session.id;
  },
};
