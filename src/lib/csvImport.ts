/**
 * Importar el "Registro contable" (CSV exportado de la app de gastos).
 *
 * Columnas: Fecha, Cuenta, Categoría, Subcategorías, Nota, COP,
 * Ingreso/Gasto, Descripción, …
 *
 * Cómo se lee cada fila:
 *   Gasto           gasto en `Cuenta`; la categoría es la subcategoría y
 *                   `Categoría` (Fijos/Variables) queda como su etiqueta
 *                   ("fijo", "variable").
 *   Ingreso         ingreso en `Cuenta`, categoría = `Categoría`.
 *   Dinero gastado  transferencia de `Cuenta` a la cuenta que viene en
 *                   `Categoría` (pagar la tarjeta, mandar a ahorros…).
 *   Modificar saldo no es un movimiento: es el saldo de partida de la cuenta.
 *
 * Puro: no toca la red. `applyPlan` es quien escribe en PocketBase.
 */
import type PocketBase from "pocketbase";

import { PRESET_COLORS } from "./palettes";
import type { AccountType } from "./types";

export interface CsvAccount {
  name: string;
  type: AccountType;
  initial: number;
}

export interface CsvCategory {
  name: string;
  kind: "income" | "expense";
  tags: string[];
}

/** "Fijos" -> "fijo", "Variables" -> "variable"; lo demás, en minúsculas. */
const TAG_OF: Record<string, string> = { fijos: "fijo", variables: "variable" };
const tagOf = (raw: string) => {
  const t = norm(raw).replace(/,/g, "");
  return TAG_OF[t] ?? t;
};

export interface CsvTx {
  key: string;
  type: "income" | "expense" | "transfer";
  date: string;
  account: string;
  toAccount: string;
  category: string;
  amount: number;
  description: string;
  notes: string;
}

export interface CsvPlan {
  accounts: CsvAccount[];
  categories: CsvCategory[];
  transactions: CsvTx[];
  skipped: number;
}

/** Filas de un CSV con comillas, comas y saltos de línea dentro de campos. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const clean = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** El tipo de cuenta por su nombre: lo que se pueda adivinar. */
export function guessAccountType(name: string): AccountType {
  const n = norm(name);
  if (/mastercard|visa|amex|black|tarjeta|credito/.test(n) || n === "nubank") return "tarjeta";
  if (/efectivo|cash/.test(n)) return "efectivo";
  if (/inversion|fiducia|fondo/.test(n)) return "inversion";
  if (/cdt/.test(n)) return "cdt";
  if (/proteccion|porvenir|colfondos|pension|cesantia/.test(n)) return "pension";
  return "ahorros";
}

/** FNV-1a: un id estable por fila, para no duplicar al importar otra vez. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** "21/09/2026 10:40:38" -> "2026-09-21". */
function toDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(clean(s));
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Un número del archivo: "51000", "51000.0", "3.4E7", o con adornos como "$ 51,000". */
function num(s: string): number {
  const raw = clean(s);
  const n = raw ? Number(raw) : NaN;
  // Tal cual primero: así "3.4E7" es 34.000.000 y no 3,47.
  return Number.isFinite(n) ? n : Number(raw.replace(/[^\d.-]/g, ""));
}

function amountOf(cop: string, importe: string): number {
  const a = num(cop);
  if (Number.isFinite(a) && a > 0) return a;
  const b = num(importe);
  return Number.isFinite(b) ? Math.abs(b) : 0;
}

export function planFromCsv(text: string): CsvPlan {
  const rows = parseCsv(text);
  const head = rows[0]?.map(norm) ?? [];
  const col = (name: string) => head.indexOf(name);
  const I = {
    date: col("fecha"),
    account: col("cuenta"),
    category: col("categoria"),
    sub: col("subcategorias"),
    note: col("nota"),
    cop: col("cop"),
    kind: col("ingreso/gasto"),
    desc: col("descripcion"),
    importe: col("importe"),
  };
  if (I.date < 0 || I.account < 0 || I.kind < 0) throw new Error("El CSV no tiene las columnas Fecha, Cuenta e Ingreso/Gasto.");

  const accounts = new Map<string, CsvAccount>();
  const categories = new Map<string, CsvCategory>();
  const transactions: CsvTx[] = [];
  let skipped = 0;

  const account = (name: string) => {
    const k = norm(name);
    if (!accounts.has(k)) accounts.set(k, { name: clean(name), type: guessAccountType(name), initial: 0 });
    return accounts.get(k)!.name;
  };
  const category = (name: string, kind: "income" | "expense", tag = "") => {
    const k = `${kind}:${norm(name)}`;
    if (!categories.has(k)) categories.set(k, { name: clean(name), kind, tags: [] });
    const c = categories.get(k)!;
    if (tag && !c.tags.includes(tag)) c.tags.push(tag);
    return c.name;
  };

  for (const r of rows.slice(1)) {
    const date = toDate(r[I.date]);
    const acc = clean(r[I.account]);
    const kind = norm(r[I.kind]);
    const amount = amountOf(r[I.cop], r[I.importe]);
    if (!date || !acc || !amount) {
      skipped++;
      continue;
    }
    const cat = clean(r[I.category]);
    const sub = clean(r[I.sub]);
    const note = clean(r[I.note]);
    const desc = clean(r[I.desc]);
    const key = `csv:${hash(r.slice(0, 8).join("|"))}`;

    if (norm(cat) === "modificar saldo") {
      const a = account(acc);
      accounts.get(norm(a))!.initial += kind === "gasto" ? -amount : amount;
      continue;
    }

    if (kind === "dinero gastado" || kind === "transferencia") {
      // Sin la cuenta de destino no hay transferencia (y una cuenta sin
      // nombre no se puede crear).
      if (!cat) {
        skipped++;
        continue;
      }
      transactions.push({
        key,
        type: "transfer",
        date,
        account: account(acc),
        toAccount: account(cat),
        category: "",
        amount,
        description: note,
        notes: desc,
      });
    } else if (kind === "ingreso") {
      transactions.push({
        key,
        type: "income",
        date,
        account: account(acc),
        toAccount: "",
        category: category(sub || cat || "Otros ingresos", "income"),
        amount,
        description: note,
        notes: desc,
      });
    } else if (kind === "gasto") {
      transactions.push({
        key,
        type: "expense",
        date,
        account: account(acc),
        toAccount: "",
        // Con subcategoría, la de arriba (Fijos/Variables) va como etiqueta.
        category: category(sub || cat || "Otros gastos", "expense", sub && cat ? tagOf(cat) : ""),
        amount,
        description: note,
        notes: desc,
      });
    } else skipped++;
  }

  return { accounts: [...accounts.values()], categories: [...categories.values()], transactions, skipped };
}

/** Icono para las categorías que trae el registro. */
const CATEGORY_ICONS: Record<string, string> = {
  "comer afuera": "restaurant-01",
  "vida social": "user-group",
  personal: "user",
  familia: "user-multiple",
  transporte: "car-01",
  viajes: "airplane-01",
  hogar: "home-01",
  arriendo: "house-01",
  mercado: "shopping-cart-01",
  servicios: "flash",
  creditos: "bank",
  administracion: "building-03",
  salud: "medicine-02",
  nivelacion: "exchange-01",
  predial: "court-house",
  impuestos: "court-house",
  imprevistos: "umbrella",
  educacion: "book-open-01",
  seguros: "shield-01",
  salario: "money-bag-02",
  intereses: "analytics-up",
  otro: "money-add-01",
};

const ACCOUNT_ICONS: Record<AccountType, string> = {
  ahorros: "bank",
  corriente: "wallet-01",
  inversion: "analytics-up",
  cdt: "coins-01",
  pension: "umbrella",
  efectivo: "money-bag-02",
  tarjeta: "credit-card",
  credito: "invoice-01",
  inmueble: "house-01",
  otro: "wallet-02",
};

export interface ApplyResult {
  accountsCreated: number;
  categoriesCreated: number;
  created: number;
  duplicated: number;
}

/**
 * Escribe el plan: crea lo que falte (cuentas y categorías se reconocen por
 * nombre) y las transacciones que no estén ya. Una cuenta nueva arranca con
 * el saldo de "Modificar saldo"; una que ya existía no se toca.
 */
export async function applyPlan(pb: PocketBase, owner: string, plan: CsvPlan, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
  const out: ApplyResult = { accountsCreated: 0, categoriesCreated: 0, created: 0, duplicated: 0 };

  const accs = await pb.collection("accounts").getFullList<{ id: string; name: string }>({ filter: pb.filter("owner = {:o}", { o: owner }) });
  const accId = new Map(accs.map((a) => [norm(a.name), a.id]));
  for (const [i, a] of plan.accounts.entries()) {
    if (accId.has(norm(a.name))) continue;
    const r = await pb.collection("accounts").create({
      owner,
      name: a.name,
      type: a.type,
      icon: ACCOUNT_ICONS[a.type],
      palette: PRESET_COLORS[(accs.length + i) % PRESET_COLORS.length].hex,
      initial_balance: a.initial,
      sort: accs.length + i,
    });
    accId.set(norm(a.name), r.id);
    out.accountsCreated++;
  }

  const cats = await pb
    .collection("categories")
    .getFullList<{ id: string; name: string; kind: string; tags: string[] | null }>({ filter: pb.filter("owner = {:o}", { o: owner }) });
  const catId = new Map(cats.map((c) => [`${c.kind}:${norm(c.name)}`, c.id]));
  for (const c of plan.categories) {
    const k = `${c.kind}:${norm(c.name)}`;
    if (catId.has(k)) {
      // Ya existe: solo se le suman las etiquetas que le falten.
      const had = cats.find((x) => x.id === catId.get(k))?.tags ?? [];
      const missing = c.tags.filter((t) => !had.includes(t));
      if (missing.length) await pb.collection("categories").update(catId.get(k)!, { tags: [...had, ...missing] });
      continue;
    }
    const r = await pb.collection("categories").create({
      owner,
      name: c.name,
      kind: c.kind,
      icon: CATEGORY_ICONS[norm(c.name)] ?? (c.kind === "income" ? "money-add-01" : "tag-01"),
      tags: c.tags,
      // Sin color: el servidor le pone uno que no tenga otra (pb_hooks/lib/tints.js).
    });
    catId.set(k, r.id);
    out.categoriesCreated++;
  }

  const existing = new Set(
    (
      await pb.collection("transactions").getFullList<{ external_id: string }>({
        filter: pb.filter("owner = {:o} && external_id ~ 'csv:'", { o: owner }),
        fields: "external_id",
      })
    ).map((t) => t.external_id),
  );

  const todo = plan.transactions.filter((t) => {
    if (existing.has(t.key)) {
      out.duplicated++;
      return false;
    }
    return true;
  });

  // En lotes: 300 filas una por una tardan; en paralelo de a 10 no.
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(
      todo.slice(i, i + 10).map((t) =>
        pb.collection("transactions").create({
          owner,
          type: t.type,
          date: `${t.date} 12:00:00.000Z`,
          account: accId.get(norm(t.account)),
          to_account: t.toAccount ? accId.get(norm(t.toAccount)) : "",
          category: t.category ? catId.get(`${t.type}:${norm(t.category)}`) : "",
          amount: t.amount,
          description: t.description.slice(0, 200),
          notes: t.notes,
          tags: [],
          source: "csv",
          external_id: t.key,
        }),
      ),
    );
    out.created += Math.min(10, todo.length - i);
    onProgress?.(out.created, todo.length);
  }
  return out;
}
