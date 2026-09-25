/**
 * Las cuentas de la casa, sin nada de interfaz: saldos del plan mensual,
 * crecimiento de los ahorros, simulación a N meses y agrupación por periodo.
 *
 * Todo trabaja con fechas "AAAA-MM-DD" (texto): el dinero es del día, no de la
 * hora, y así no hay zonas horarias que muevan un gasto de mes.
 */

export type Kind = "income" | "expense";
export type TxType = Kind | "transfer";
export type Frequency = "monthly" | "yearly" | "once";

export interface RecurringLike {
  kind: Kind;
  amount: number;
  frequency?: Frequency | "";
  day_of_month?: number;
  month?: number;
  start_date?: string;
  end_date?: string;
  paused?: boolean;
}

export interface SavingLike {
  id: string;
  name: string;
  monthly_amount: number;
  annual_rate: number;
  archived?: boolean;
}

export interface TxLike {
  type: TxType;
  date: string;
  amount: number;
  category?: string;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const dayOf = (s: string) => String(s ?? "").slice(0, 10);

/** "2026-09" -> suma meses -> "2026-11". */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function monthRange(ym: string): [string, string] {
  return [`${ym}-01`, `${addMonths(ym, 1)}-01`];
}

/** El lunes de la semana de una fecha. */
export function weekStart(s: string): string {
  const [y, m, d] = dayOf(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - dow);
  return ymd(dt);
}

// ---------------------------------------------------------------------------
// El plan mensual
// ---------------------------------------------------------------------------

/** Si un fijo cae en el mes dado ("AAAA-MM") y cuánto. */
export function occursIn(r: RecurringLike, ym: string): number {
  if (r.paused) return 0;
  const start = dayOf(r.start_date ?? "");
  const end = dayOf(r.end_date ?? "");
  const [first, next] = monthRange(ym);
  if (start && start >= next) return 0;
  if (end && end < first) return 0;
  const freq = r.frequency || "monthly";
  if (freq === "monthly") return r.amount;
  if (freq === "yearly") return Number(ym.slice(5)) === (r.month || 1) ? r.amount : 0;
  // Una sola vez: el mes de su fecha de inicio.
  return start && start.slice(0, 7) === ym ? r.amount : 0;
}

/** Lo que vale un fijo al mes, promediado: el anual se reparte en doce. */
export function monthlyEquivalent(r: RecurringLike): number {
  if (r.paused) return 0;
  const freq = r.frequency || "monthly";
  if (freq === "monthly") return r.amount;
  if (freq === "yearly") return r.amount / 12;
  return 0;
}

export interface PlanSummary {
  income: number;
  fixed: number;
  savings: number;
  /** Lo que queda para gastar después de fijos y ahorros. */
  free: number;
}

export function planSummary(recurring: RecurringLike[], savings: SavingLike[]): PlanSummary {
  let income = 0;
  let fixed = 0;
  for (const r of recurring) {
    const v = monthlyEquivalent(r);
    if (r.kind === "income") income += v;
    else fixed += v;
  }
  const sav = savings.filter((s) => !s.archived).reduce((a, s) => a + (s.monthly_amount || 0), 0);
  return { income, fixed, savings: sav, free: income - fixed - sav };
}

// ---------------------------------------------------------------------------
// Ahorros
// ---------------------------------------------------------------------------

/** Tasa mensual equivalente a una efectiva anual en porcentaje. */
export const monthlyRate = (annualPct: number) => Math.pow(1 + (annualPct || 0) / 100, 1 / 12) - 1;

/** Valor futuro con aporte mensual al final de cada mes. */
export function futureValue(current: number, monthly: number, annualPct: number, months: number): number {
  const r = monthlyRate(annualPct);
  if (r === 0) return current + monthly * months;
  const g = Math.pow(1 + r, months);
  return current * g + monthly * ((g - 1) / r);
}

/** Cuántos meses para llegar a `target`; `null` si no se llega en 100 años. */
export function monthsToTarget(current: number, monthly: number, annualPct: number, target: number): number | null {
  if (current >= target) return 0;
  const r = monthlyRate(annualPct);
  let v = current;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r) + monthly;
    if (v >= target) return m;
  }
  return null;
}

/** El aporte mensual que hace falta para llegar a `target` en `months`. */
export function monthlyNeeded(current: number, annualPct: number, target: number, months: number): number {
  if (months <= 0) return Math.max(0, target - current);
  const r = monthlyRate(annualPct);
  if (r === 0) return Math.max(0, (target - current) / months);
  const g = Math.pow(1 + r, months);
  return Math.max(0, ((target - current * g) * r) / (g - 1));
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

export interface SimInput {
  /** Mes desde el que se simula ("AAAA-MM"); el primero que se suma es el siguiente. */
  from: string;
  months: number;
  /** Lo que hay hoy en todas las cuentas que cuentan. */
  total: number;
  recurring: RecurringLike[];
  savings: (SavingLike & { current: number })[];
  /** Cuánto de lo libre se gasta cada mes (0..1). 1 = se gasta todo. */
  spendRatio: number;
  /** Ingreso o gasto extra cada mes (negativo = gasto). */
  extraMonthly?: number;
  /** Rendimiento efectivo anual de lo que no está en ahorros. */
  baseRate?: number;
}

export interface SimRow {
  month: string;
  income: number;
  expense: number;
  total: number;
  free: number;
  savingsTotal: number;
  perSaving: Record<string, number>;
}

export function simulate(input: SimInput): SimRow[] {
  const active = input.savings.filter((s) => !s.archived);
  const pots: Record<string, number> = {};
  for (const s of active) pots[s.id] = s.current;
  const inPots = active.reduce((a, s) => a + s.current, 0);
  let loose = input.total - inPots;
  const baseR = monthlyRate(input.baseRate ?? 0);
  const rows: SimRow[] = [];

  for (let i = 1; i <= input.months; i++) {
    const month = addMonths(input.from, i);
    let income = 0;
    let fixed = 0;
    for (const r of input.recurring) {
      const v = occursIn(r, month);
      if (r.kind === "income") income += v;
      else fixed += v;
    }
    const contrib = active.reduce((a, s) => a + (s.monthly_amount || 0), 0);
    const free = income - fixed - contrib + (input.extraMonthly ?? 0);
    const spent = Math.max(0, free) * Math.min(1, Math.max(0, input.spendRatio));
    loose = loose * (1 + baseR) + income - fixed - contrib + (input.extraMonthly ?? 0) - spent;
    for (const s of active) pots[s.id] = pots[s.id] * (1 + monthlyRate(s.annual_rate)) + (s.monthly_amount || 0);
    const savingsTotal = Object.values(pots).reduce((a, b) => a + b, 0);
    rows.push({
      month,
      income,
      expense: fixed + spent,
      free,
      total: loose + savingsTotal,
      savingsTotal,
      perSaving: { ...pots },
    });
  }
  return rows;
}

/** El primer mes en que el total llega a `target`, dentro de la simulación. */
export function whenTotalReaches(rows: SimRow[], target: number): SimRow | null {
  return rows.find((r) => r.total >= target) ?? null;
}

// ---------------------------------------------------------------------------
// Estados: agrupar por periodo y por categoría
// ---------------------------------------------------------------------------

export type Granularity = "week" | "month" | "year";

export function periodKey(date: string, g: Granularity): string {
  const d = dayOf(date);
  if (g === "year") return d.slice(0, 4);
  if (g === "month") return d.slice(0, 7);
  return weekStart(d);
}

export interface Bucket {
  key: string;
  income: number;
  expense: number;
  net: number;
}

/** Suma ingresos y gastos por periodo. Las transferencias no son ni lo uno ni lo otro. */
export function bucketize(txs: TxLike[], g: Granularity, keys?: string[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const k of keys ?? []) map.set(k, { key: k, income: 0, expense: 0, net: 0 });
  for (const t of txs) {
    if (t.type === "transfer") continue;
    const k = periodKey(t.date, g);
    if (keys && !map.has(k)) continue;
    const b = map.get(k) ?? { key: k, income: 0, expense: 0, net: 0 };
    if (t.type === "income") b.income += t.amount;
    else b.expense += t.amount;
    b.net = b.income - b.expense;
    map.set(k, b);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function byCategory(txs: TxLike[], kind: Kind): { category: string; total: number; count: number }[] {
  const map = new Map<string, { category: string; total: number; count: number }>();
  for (const t of txs) {
    if (t.type !== kind) continue;
    const k = t.category || "";
    const e = map.get(k) ?? { category: k, total: 0, count: 0 };
    e.total += t.amount;
    e.count++;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Las semanas (lunes) que tocan un mes. */
export function weeksOfMonth(ym: string): string[] {
  const [first, next] = monthRange(ym);
  const out: string[] = [];
  let w = weekStart(first);
  while (w < next) {
    out.push(w);
    const [y, m, d] = w.split("-").map(Number);
    w = ymd(new Date(y, m - 1, d + 7));
  }
  return out;
}

export function monthsOfYear(y: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
}
