/**
 * Lo de las tarjetas de crédito en el plan de un mes, al día: carga los gastos
 * con tarjeta y los pagos a las tarjetas del mes, y los junta con la deuda de
 * hoy (ver `cardPlan`). Se llama al crear el componente que lo muestra.
 */
import { cardDebt, cardPlan, isCard, type CardExpense } from "./cards";
import { monthRange, today } from "./finance";
import { notify } from "./notify.svelte";
import { cachedList } from "./offline.svelte";
import { pb } from "./pb.svelte";
import { store } from "./store.svelte";
import type { Transaction } from "./types";

type Row = Pick<Transaction, "type" | "amount" | "account" | "to_account" | "external_id" | "recurring_key">;

export function useCardPlan(ym: () => string) {
  const thisYm = today().slice(0, 7);
  let expenses = $state<CardExpense[]>([]);
  let paid = $state(0);
  const cards = $derived(store.activeAccounts.filter(isCard).map((a) => a.id));

  $effect(() => {
    void store.txVersion;
    const month = ym();
    const ids = cards;
    if (!ids.length) {
      expenses = [];
      paid = 0;
      return;
    }
    let alive = true;
    const [from, to] = monthRange(month);
    const params: Record<string, string> = { from, to };
    ids.forEach((id, i) => (params[`a${i}`] = id));
    const any = (field: string) => `(${ids.map((_, i) => `${field} = {:a${i}}`).join(" || ")})`;
    const filter = pb.filter(
      `date >= {:from} && date < {:to} && ((type = "expense" && ${any("account")}) || (type = "transfer" && ${any("to_account")}))`,
      params,
    );
    cachedList<Row>(
      `cards-month:${month}`,
      () =>
        pb
          .collection("transactions")
          .getFullList<Row>({
            filter,
            fields: "type,amount,account,to_account,external_id,recurring_key",
            batch: 500,
          }),
      (rows) => {
        if (!alive) return;
        const card = new Set(ids);
        const keyOf = (t: Row) => t.recurring_key || t.external_id || "";
        // Una transferencia programada que reserva dinero para un pago ya está en los pagos programados.
        const planned = new Set(store.recurring.filter((r) => r.kind === "transfer" && r.for_payment).map((r) => r.id));
        expenses = rows
          .filter((t) => t.type === "expense")
          .map((t) => ({ amount: t.amount, programmed: keyOf(t).startsWith("rec:") }));
        paid = rows
          .filter((t) => t.type === "transfer" && !card.has(t.account) && !planned.has(keyOf(t).split(":")[1] ?? ""))
          .reduce((sum, t) => sum + t.amount, 0);
      },
    ).catch(notify.fail);
    return () => (alive = false);
  });

  const debt = $derived(cardDebt(store.accounts, (id) => store.balance(id)));
  const plan = $derived(cardPlan(ym(), thisYm, debt, expenses, paid));
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
