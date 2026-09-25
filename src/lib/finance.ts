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
  /**
   * La parte del aporte que sale de las cuentas propias (0..1). En un ahorro
   * compartido cada quien pone lo suyo; sin ella, todo.
   */
  share?: number;
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

/** Cuántos meses van de `from` a `to` ("AAAA-MM"), contando los dos; 0 si `to` es anterior. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm) + 1);
}

/** Cuántos días van de `from` a `to` ("AAAA-MM-DD"), contando los dos; 0 si `to` es anterior. */
export function daysBetween(from: string, to: string): number {
  // Como fechas UTC los días miden siempre lo mismo: ningún cambio de hora los descuadra.
  return Math.max(0, Math.round((Date.parse(dayOf(to)) - Date.parse(dayOf(from))) / 864e5) + 1);
}

/** El último día de un mes ("AAAA-MM"): el día cero del siguiente. */
export function lastDayOf(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
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

/**
 * El día en que cae un fijo dentro del mes dado ("AAAA-MM"), o `null` si ese
 * mes no le toca. Es la misma cuenta del programador
 * (`pb_hooks/lib/scheduler.js`): el día del mes (o el último, si el mes es
 * más corto) tiene que caer entre el inicio y el fin. Un fijo del día 5 que
 * empieza el 20 arranca el mes siguiente; uno que termina el 3 no alcanza
 * ese mes.
 */
export function occurrenceDate(r: RecurringLike, ym: string): string | null {
  const start = dayOf(r.start_date ?? "");
  const end = dayOf(r.end_date ?? "");
  const freq = r.frequency || "monthly";
  let date: string;
  if (freq === "once") {
    // Una sola vez: su fecha de inicio.
    if (!start || start.slice(0, 7) !== ym) return null;
    date = start;
  } else {
    if (freq === "yearly" && Number(ym.slice(5)) !== (r.month || 1)) return null;
    date = `${ym}-${pad(Math.min(r.day_of_month || 1, lastDayOf(ym)))}`;
    if (start && date < start) return null;
  }
  if (end && date > end) return null;
  return date;
}

/** Si un fijo cae en el mes dado ("AAAA-MM") y cuánto. */
export function occursIn(r: RecurringLike, ym: string): number {
  if (r.paused) return 0;
  return occurrenceDate(r, ym) ? r.amount : 0;
}

/** Si las fechas de un fijo (inicio y fin) tocan el mes dado. */
export function activeIn(r: RecurringLike, ym: string): boolean {
  const [first, next] = monthRange(ym);
  const start = dayOf(r.start_date ?? "");
  const end = dayOf(r.end_date ?? "");
  return !(start && start >= next) && !(end && end < first);
}

/**
 * Lo que vale un fijo en un mes cualquiera, promediado: el anual se reparte
 * en doce y el de una sola vez no cuenta. Con `ym`, solo si sus fechas tocan
 * ese mes: el crédito que ya se terminó de pagar o el sueldo que empieza el
 * otro año no son del plan de hoy.
 */
export function monthlyEquivalent(r: RecurringLike, ym?: string): number {
  if (r.paused) return 0;
  const freq = r.frequency || "monthly";
  if (freq === "once" || (ym && !activeIn(r, ym))) return 0;
  return freq === "yearly" ? r.amount / 12 : r.amount;
}

/** Lo que aporta al mes un ahorro desde las cuentas propias. */
export const savingMonthly = (s: SavingLike) => (s.monthly_amount || 0) * (s.share ?? 1);

export interface PlanSummary {
  income: number;
  fixed: number;
  savings: number;
  /** Lo que queda para gastar después de fijos y ahorros. */
  free: number;
}

/** El plan del mes `ym` (por defecto, el actual). */
export function planSummary(recurring: RecurringLike[], savings: SavingLike[], ym = today().slice(0, 7)): PlanSummary {
  let income = 0;
  let fixed = 0;
  for (const r of recurring) {
    const v = monthlyEquivalent(r, ym);
    if (r.kind === "income") income += v;
    else fixed += v;
  }
  const sav = savings.filter((s) => !s.archived).reduce((a, s) => a + savingMonthly(s), 0);
  return { income, fixed, savings: sav, free: income - fixed - sav };
}

export interface BudgetUse {
  /** Lo que el plan deja libre (nunca menos de cero). */
  budget: number;
  /** Gastos fijos del mes (con #fijo) y variables (el resto). */
  fixed: number;
  variable: number;
  /** Lo que los fijos pasan de lo planeado. */
  fixedOver: number;
  /** Lo que ya se usó de lo libre: los variables más ese exceso. */
  used: number;
  /** Lo que queda; negativo si se gastó de más. */
  left: number;
  /** Porcentaje usado de lo libre, de 0 a 100. */
  pct: number;
}

/**
 * Cómo va lo libre del mes. Lo libre ya descontó los fijos planeados, así
 * que contra él solo van los gastos variables; si los fijos pasan de lo
 * planeado, el exceso también sale de ahí. `fixed` dice qué gasto es fijo.
 */
export function budgetUse(plan: PlanSummary, expenses: { amount: number; fixed: boolean }[]): BudgetUse {
  let fixed = 0;
  let variable = 0;
  for (const e of expenses) {
    if (e.fixed) fixed += e.amount;
    else variable += e.amount;
  }
  const budget = Math.max(0, plan.free);
  const fixedOver = Math.max(0, fixed - plan.fixed);
  const used = variable + fixedOver;
  return {
    budget,
    fixed,
    variable,
    fixedOver,
    used,
    left: budget - used,
    pct: budget > 0 ? Math.min(100, (used / budget) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Ahorros
// ---------------------------------------------------------------------------

/**
 * Tasa mensual equivalente a una efectiva anual en porcentaje. Por debajo de
 * −100 % no hay tasa (se perdería más de todo): se queda en −100 %.
 */
export function monthlyRate(annualPct: number): number {
  const pct = Number.isFinite(annualPct) ? Math.max(-100, annualPct) : 0;
  return Math.pow(1 + pct / 100, 1 / 12) - 1;
}

/**
 * Reparte `total` en pesos enteros según los porcentajes, sin que se pierda
 * ni sobre un peso: lo que dejan los redondeos va a las partes con más
 * decimales. Los porcentajes se toman como proporciones, así que no tienen
 * que sumar 100.
 */
export function splitByPercent(total: number, percents: number[]): number[] {
  const weights = percents.map((p) => Math.max(0, Number(p) || 0));
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!sum) return weights.map(() => 0);
  const whole = Math.round(total);
  const raw = weights.map((w) => (whole * w) / sum);
  const parts = raw.map((v) => Math.floor(v));
  let rest = whole - parts.reduce((a, v) => a + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter(({ i }) => weights[i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k].i]++;
  return parts;
}

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
  /** `current`: lo que ya tiene el ahorro en las cuentas propias. */
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
  // Lo que no cambia de un mes a otro se calcula una vez.
  const active = input.savings
    .filter((s) => !s.archived)
    .map((s) => ({ id: s.id, current: s.current || 0, monthly: savingMonthly(s), rate: monthlyRate(s.annual_rate) }));
  const pots: Record<string, number> = {};
  for (const s of active) pots[s.id] = s.current;
  const inPots = active.reduce((a, s) => a + s.current, 0);
  const contrib = active.reduce((a, s) => a + s.monthly, 0);
  const extra = input.extraMonthly || 0;
  const ratio = Math.min(1, Math.max(0, input.spendRatio || 0));
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
    const free = income - fixed - contrib + extra;
    const spent = Math.max(0, free) * ratio;
    loose = loose * (1 + baseR) + free - spent;
    for (const s of active) pots[s.id] = pots[s.id] * (1 + s.rate) + s.monthly;
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

export interface PeriodSpan {
  /** Semanas, meses y años que van (nunca menos de uno: sirven para dividir). */
  weeks: number;
  months: number;
  years: number;
  /** Meses con presupuesto: del primer movimiento al final del periodo (en semanal, el mes). */
  budgetMonths: number;
}

/**
 * Lo que va de un periodo `[from, to)`: desde el primer movimiento (o el
 * inicio) hasta hoy (o el final). Con eso se promedia y se mide el
 * presupuesto: un año que va por septiembre, o que se empezó a anotar en
 * junio, no se divide entre doce ni suma el presupuesto de meses sin datos.
 */
export function periodSpan(range: [string, string], firstData: string | null, now: string, g: Granularity): PeriodSpan {
  const [a, b] = range;
  const fromDay = firstData && dayOf(firstData) > a ? dayOf(firstData) : a;
  const lastMonth = addMonths(b.slice(0, 7), -1);
  const lastDay = `${lastMonth}-${pad(lastDayOf(lastMonth))}`;
  const untilDay = dayOf(now) < lastDay ? dayOf(now) : lastDay;
  const from = fromDay.slice(0, 7);
  const until = untilDay.slice(0, 7);
  const years = until < from ? 0 : Number(until.slice(0, 4)) - Number(from.slice(0, 4)) + 1;
  return {
    weeks: Math.max(1, daysBetween(fromDay, untilDay) / 7),
    months: Math.max(1, monthsBetween(from, until)),
    years: Math.max(1, years),
    budgetMonths: g === "week" ? 1 : monthsBetween(from, lastMonth),
  };
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
