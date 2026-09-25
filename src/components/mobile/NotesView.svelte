<!--
  Los movimientos del mes juntados por su descripción: cuántas veces y
  cuánto sumó cada una ("Almuerzo" ×12). Tocar una la busca en el diario.
-->
<script lang="ts">
  import Money from "../app/Money.svelte";
  import Segmented from "../app/Segmented.svelte";
  import type { Transaction } from "../../lib/types";

  let { txs, onPick }: { txs: Transaction[]; onPick: (text: string) => void } = $props();

  let kind = $state<"expense" | "income">("expense");

  const rows = $derived.by(() => {
    const map = new Map<string, { text: string; count: number; total: number }>();
    for (const t of txs) {
      if (t.type !== kind) continue;
      const text = t.description.trim() || "(sin descripción)";
      const k = text.toLowerCase();
      const e = map.get(k) ?? { text, count: 0, total: 0 };
      e.count++;
      e.total += t.amount;
      map.set(k, e);
    }
    return [...map.values()].toSorted((a, b) => b.total - a.total);
  });
</script>

<div class="n-seg">
  <Segmented
    bind:value={kind}
    options={[
      { id: "expense", label: "Gastos" },
      { id: "income", label: "Ingresos" },
    ]}
    full
    label="Tipo"
  />
</div>

<ul class="n-list">
  {#each rows as r (r.text)}
    <li>
      <button type="button" onclick={() => onPick(r.text === "(sin descripción)" ? "" : r.text)}>
        <span class="n-text">{r.text}</span>
        <span class="n-count">{r.count}</span>
        <Money value={r.total} tone={kind} />
      </button>
    </li>
  {:else}
    <li class="n-empty">Nada este mes.</li>
  {/each}
</ul>

<style>
  .n-seg {
    padding: var(--sp-12) var(--sp-16);
  }

  .n-list {
    margin: 0;
    padding: 0;
    list-style: none;

    & button {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--sp-12);
      width: 100%;
      padding: var(--sp-12) var(--sp-16);
      border: 0;
      border-bottom: 1px solid var(--border);
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;

      &:active {
        background: var(--bg-hover);
      }
    }
  }

  .n-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .n-count {
    min-width: 1.75rem;
    padding: 0.0625rem var(--sp-6);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-hover);
    font-family: var(--font-num);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    text-align: center;
  }

  .n-empty {
    padding: var(--sp-40) var(--sp-16);
    color: var(--text-muted);
    text-align: center;
  }
</style>
