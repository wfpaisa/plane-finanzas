/**
 * Lo de las tarjetas de crédito en el plan de un mes, al día: carga los gastos
 * con tarjeta del mes y los junta con la deuda de hoy (ver `cardPlan`). Se
 * llama al crear el componente que lo muestra.
 */
import { cardDebt, cardPlan, isCard, type CardExpense } from "./cards";
import { monthRange, today } from "./finance";
import { notify } from "./notify.svelte";
import { cachedList } from "./offline.svelte";
import { pb } from "./pb.svelte";
import { store } from "./store.svelte";
import type { Transaction } from "./types";

type Row = Pick<Transaction, "amount" | "external_id" | "recurring_key">;

export function useCardPlan(ym: () => string) {
  const thisYm = today().slice(0, 7);
  let expenses = $state<CardExpense[]>([]);
  const cards = $derived(store.activeAccounts.filter(isCard).map((a) => a.id));

  $effect(() => {
    void store.txVersion;
    const month = ym();
    const ids = cards;
    if (!ids.length) {
      expenses = [];
      return;
    }
    let alive = true;
    const [from, to] = monthRange(month);
    const params: Record<string, string> = { from, to };
    ids.forEach((id, i) => (params[`a${i}`] = id));
    const filter = pb.filter(
      `type = "expense" && date >= {:from} && date < {:to} && (${ids.map((_, i) => `account = {:a${i}}`).join(" || ")})`,
      params,
    );
    cachedList<Row>(
      `cards:${month}`,
      () =>
        pb
          .collection("transactions")
          .getFullList<Row>({
            filter,
            fields: "amount,external_id,recurring_key",
            batch: 500,
          }),
      (rows) =>
        alive &&
        (expenses = rows.map((t) => ({
          amount: t.amount,
          programmed:
            !!t.recurring_key || (t.external_id ?? "").startsWith("rec:"),
        }))),
    ).catch(notify.fail);
    return () => (alive = false);
  });

  const debt = $derived(cardDebt(store.accounts, (id) => store.balance(id)));
  const plan = $derived(cardPlan(ym(), thisYm, debt, expenses));
  return {
    get current() {
      return plan;
    },
    /** Si hay tarjetas de crédito activas. */
    get any() {
      return cards.length > 0;
    },
  };
}
