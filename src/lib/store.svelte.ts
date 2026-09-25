/**
 * Lo que la app tiene en memoria: cuentas, saldos, categorías, ahorros y
 * fijos. Son pocos registros por usuario, así que se cargan todos al entrar y
 * se recargan cuando PocketBase avisa de un cambio (tiempo real). Las
 * transacciones no: esas se piden por rango en cada pantalla.
 *
 * Una copia queda en el teléfono: al entrar sin internet la app abre con
 * ella, y los saldos suman lo que falta por enviar (ver offline.svelte.ts).
 */
import { planSummary } from "./finance";
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

// Lo que las pantallas leen a cada rato (a veces una vez por fila) se
// calcula una sola vez por cambio.
const activeAccounts = $derived(accounts.filter((a) => !a.archived));
const activeSavings = $derived(savings.filter((s) => !s.archived));
const accountIds = $derived(new Set(accounts.map((a) => a.id)));
const total = $derived(
  accounts
    .filter((a) => !a.archived && !a.exclude_from_total)
    .reduce((s, a) => s + (balances[a.id] ?? 0) + offline.delta(a.id), 0),
);

/** Los aportes sumados: por ahorro, por cuenta y lo de cada ahorro en las cuentas propias. */
const saved = $derived.by(() => {
  const bySaving = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const mine = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, v: number) => map.set(key, (map.get(key) ?? 0) + v);
  for (const m of movements) {
    add(bySaving, m.saving, m.amount);
    add(byAccount, m.account, m.amount);
    // Sin cuenta, es de quien lo anotó.
    if (m.account ? accountIds.has(m.account) : m.created_by === session.id) add(mine, m.saving, m.amount);
  }
  return { bySaving, byAccount, mine };
});

/**
 * La parte del aporte mensual de un ahorro que sale de las cuentas propias:
 * la suma de los porcentajes del reparto que caen en ellas. Sin reparto, el
 * aporte automático lo hace el dueño (ver pb_hooks/lib/scheduler.js).
 */
function shareOf(s: Saving): number {
  const alloc = s.allocations ?? [];
  if (!alloc.length) return s.owner === session.id ? 1 : 0;
  const pct = alloc.reduce((a, x) => a + (accountIds.has(x.account) ? Number(x.percent) || 0 : 0), 0);
  return Math.min(1, Math.max(0, pct / 100));
}

/**
 * Ingresos − fijos − ahorros de un mes ("AAAA-MM", por defecto el actual): lo
 * que se puede gastar. De los ahorros cuenta solo la parte propia.
 */
function planFor(ym?: string) {
  return planSummary(recurring, activeSavings.map((s) => ({ ...s, share: shareOf(s) })), ym);
}

const plan = $derived(planFor());

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
  balances = {};
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
    return activeAccounts;
  },
  get categories() {
    return categories;
  },
  get savings() {
    return savings;
  },
  get activeSavings() {
    return activeSavings;
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
    return total;
  },
  /** El plan del mes: ingresos, fijos, la parte propia de los ahorros y lo que queda libre. */
  get plan() {
    return plan;
  },
  /** El plan de otro mes ("AAAA-MM"): los fijos que ya terminaron o aún no empiezan no cuentan. */
  planFor,
  account(id: string) {
    return accounts.find((a) => a.id === id);
  },
  category(id: string) {
    return categories.find((c) => c.id === id);
  },
  saving(id: string) {
    return savings.find((s) => s.id === id);
  },
  /** Lo que lleva un ahorro: la suma de sus movimientos, de todos los que aportan. */
  savingCurrent(id: string) {
    return saved.bySaving.get(id) ?? 0;
  },
  /** Lo que lleva un ahorro en las cuentas propias (en uno compartido, lo mío). */
  savingMine(id: string) {
    return saved.mine.get(id) ?? 0;
  },
  /** La parte del aporte mensual de un ahorro que sale de las cuentas propias (0..1). */
  savingShare(s: Saving) {
    return shareOf(s);
  },
  /** Cuánto de cada cuenta está apartado en ahorros. */
  earmarked(accountId: string) {
    return saved.byAccount.get(accountId) ?? 0;
  },
  isMine(ownerId: string) {
    return ownerId === session.id;
  },
};
