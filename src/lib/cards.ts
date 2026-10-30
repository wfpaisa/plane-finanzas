/**
 * Las tarjetas de crédito en el plan del mes: lo que se debe en ellas también
 * hay que reservarlo, y sale de lo disponible para gastar.
 *
 * El saldo de una tarjeta es negativo mientras se deba: cada gasto lo baja y
 * cada pago (una transferencia hacia ella) lo sube. Los pagos programados del
 * mes hechos con tarjeta ya están en los gastos programados del plan: se
 * descuentan de la deuda para no contarlos dos veces.
 *
 * Lo que se pagó a las tarjetas en el mes sigue contando: pagar la tarjeta no
 * devuelve lo gastado con ella a lo disponible para gastar.
 */
import type { Account } from "./types";

export const isCard = (a: Pick<Account, "type">) => a.type === "tarjeta";

/** Un gasto con tarjeta del mes: si paga un programado (lleva su marca), ya está en el plan. */
export interface CardExpense {
  amount: number;
  programmed: boolean;
}

export interface CardPlan {
  /** Lo que hay que reservar por las tarjetas en el mes. */
  total: number;
  /** De eso, lo gastado con tarjeta en el mes (sin los pagos programados). */
  month: number;
  /** Y lo que viene de meses anteriores. */
  before: number;
}

/**
 * Lo de las tarjetas en el plan del mes `ym`, visto desde `thisYm`.
 *
 * - En el mes en curso y en los que vienen: toda la deuda de hoy, más lo que
 *   se pagó a las tarjetas en el mes (`paid`), menos los pagos programados del
 *   mes hechos con tarjeta. Se separa lo gastado en el mes de lo que viene de
 *   antes.
 * - En un mes pasado no hay deuda de entonces: cuenta lo gastado con tarjeta
 *   ese mes.
 */
export function cardPlan(
  ym: string,
  thisYm: string,
  debt: number,
  expenses: CardExpense[],
  paid = 0,
): CardPlan {
  let month = 0;
  let programmed = 0;
  for (const e of expenses) {
    if (e.programmed) programmed += e.amount;
    else month += e.amount;
  }
  if (ym < thisYm) return { total: month, month, before: 0 };
  const total = Math.max(0, debt + paid - programmed);
  const inMonth = Math.min(month, total);
  return { total, month: inMonth, before: total - inMonth };
}

/** Lo que se debe hoy en las tarjetas activas: la suma de sus saldos negativos. */
export function cardDebt(accounts: Account[], balance: (id: string) => number) {
  return accounts
    .filter((a) => !a.archived && isCard(a))
    .reduce((sum, a) => sum + Math.max(0, -balance(a.id)), 0);
}

/** El cupo de una tarjeta, lo que se debe y lo que queda por usar. */
export function cardCredit(a: Pick<Account, "credit_limit">, balance: number) {
  const limit = a.credit_limit ?? 0;
  const owed = Math.max(0, -balance);
  return { limit, owed, available: limit + balance };
}

/** El disponible de todas las cuentas: lo que hay a favor, menos lo reservado y todas las deudas. */
export function accountAvailability(
  accounts: Account[],
  balance: (id: string) => number,
  reserved: number,
) {
  let beforeDebts = -reserved;
  let debt = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const value = balance(a.id);
    debt += Math.max(0, -value);
    if (!a.exclude_from_total) beforeDebts += Math.max(0, value);
  }
  return { beforeDebts, debt, available: beforeDebts - debt };
}
