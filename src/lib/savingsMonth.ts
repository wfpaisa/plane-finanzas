/**
 * Los aportes de un mes por ahorro: cuánto toca guardar (de uno compartido,
 * la parte propia) y cuánto se registró en cuentas propias. Solo los ahorros
 * activos con aporte mensual. Uno que ya alcanzó su meta cuenta como completo. Se llama dentro de un `$derived` para seguir
 * los cambios del store.
 */
import { savingMonthly } from "./finance";
import { session } from "./pb.svelte";
import { store } from "./store.svelte";
import type { Saving } from "./types";

/** Un ahorro con meta que ya la alcanzó: cumple aunque no tenga aporte este mes. */
export function reachedGoal(s: Saving): boolean {
  return s.target_amount > 0 && store.savingCurrent(s.id) >= s.target_amount;
}

export type MonthContribution = { goal: number; given: number; done: boolean };

export function monthContributions(ym: string): Map<string, MonthContribution> {
  const given = new Map<string, number>();
  for (const m of store.movements) {
    if (!m.date.startsWith(ym) || m.amount <= 0) continue;
    // En cuentas propias, o sin cuenta y anotado por mí.
    if (m.account ? !store.account(m.account) : m.created_by !== session.id) continue;
    given.set(m.saving, (given.get(m.saving) ?? 0) + m.amount);
  }
  const out = new Map<string, MonthContribution>();
  for (const s of store.activeSavings) {
    const goal = savingMonthly({ ...s, share: store.savingShare(s) });
    if (goal <= 0) continue;
    const g = given.get(s.id) ?? 0;
    out.set(s.id, { goal, given: g, done: g >= goal || reachedGoal(s) });
  }
  return out;
}
