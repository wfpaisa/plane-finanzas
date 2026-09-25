<!--
  El mes en resumen: cuánto del presupuesto libre se fue en gastos
  variables, cuánto de los fijos planeados ya se pagó y cómo se movió cada
  cuenta.
-->
<script lang="ts">
  import Money from "../app/Money.svelte";
  import { planSummary } from "../../lib/finance";
  import { percent } from "../../lib/format";
  import { sumOf } from "../../lib/mobile";
  import { FIXED_TAG, hasTag } from "../../lib/tags";
  import { store } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";

  let { txs }: { txs: Transaction[] } = $props();

  const plan = $derived(planSummary(store.recurring, store.activeSavings));
  const expenses = $derived(txs.filter((t) => t.type === "expense"));
  // Fijo es lo etiquetado #fijo: en su categoría o en el propio movimiento
  // (los que crea un gasto frecuente la llevan).
  const fixed = $derived(expenses.filter((t) => hasTag(t, FIXED_TAG)).reduce((s, t) => s + t.amount, 0));
  const variable = $derived(sumOf(txs, "expense") - fixed);
  const budget = $derived(Math.max(0, plan.free));

  const bars = $derived([
    { label: "Presupuesto libre", hint: "Gastos sin la etiqueta #fijo", spent: variable, of: budget },
    { label: "Fijos", hint: "Pagados de lo planeado", spent: fixed, of: plan.fixed },
  ]);

  const byAccount = $derived(
    store.activeAccounts
      .map((a) => {
        const mine = txs.filter((t) => t.account === a.id || t.to_account === a.id);
        const inc = mine.reduce((s, t) => s + (t.type === "income" || (t.type === "transfer" && t.to_account === a.id) ? t.amount : 0), 0);
        const out = mine.reduce((s, t) => s + (t.type === "expense" || (t.type === "transfer" && t.account === a.id) ? t.amount : 0), 0);
        return { a, inc, out };
      })
      .filter((r) => r.inc || r.out)
      .toSorted((x, y) => y.out - x.out),
  );
</script>

<section class="t-block">
  <h3>Presupuesto</h3>
  {#each bars as b (b.label)}
    {@const pct = b.of > 0 ? (b.spent / b.of) * 100 : 0}
    <div class="t-bar">
      <div class="t-bar-head">
        <span>
          <strong>{b.label}</strong>
          <small>{b.hint}</small>
        </span>
        <span class="t-bar-nums">
          <Money value={b.spent} /> / <Money value={b.of} />
        </span>
      </div>
      <div class="t-track"><span style:width="{Math.min(100, pct)}%" class:over={pct > 100}></span></div>
      <div class="t-bar-foot">
        <span>{b.of > 0 ? percent(pct) : "Sin plan"}</span>
        {#if b.of > 0}
          <span>{b.of - b.spent >= 0 ? "Quedan" : "Te pasaste"} <Money value={Math.abs(b.of - b.spent)} /></span>
        {/if}
      </div>
    </div>
  {/each}
</section>

<section class="t-block">
  <h3>Cuentas en el mes</h3>
  {#each byAccount as r (r.a.id)}
    <div class="t-acc">
      <span class="t-acc-name">{r.a.name}</span>
      <Money value={r.inc} tone="income" />
      <Money value={r.out} tone="expense" />
    </div>
  {:else}
    <p class="t-empty">Sin movimientos este mes.</p>
  {/each}
</section>

<style>
  .t-block {
    padding: var(--sp-16);
    border-bottom: 0.5rem solid var(--bg-hover);

    & h3 {
      margin: 0 0 var(--sp-12);
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--text-secondary);
    }
  }

  .t-bar + .t-bar {
    margin-top: var(--sp-16);
  }

  .t-bar-head,
  .t-bar-foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-8);
  }

  .t-bar-head span:first-child {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);

    & small {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .t-bar-nums {
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-align: right;
  }

  .t-track {
    height: 0.5rem;
    margin: var(--sp-6) 0 var(--sp-4);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-hover);
    overflow: hidden;

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--accent);

      &.over {
        background: var(--danger);
      }
    }
  }

  .t-bar-foot {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .t-acc {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: var(--sp-12);
    padding: var(--sp-8) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);

    &:last-child {
      border-bottom: 0;
    }
  }

  .t-acc-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .t-empty {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
