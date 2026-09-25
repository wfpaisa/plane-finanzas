<!--
  Los movimientos agrupados por día, como el diario de las apps de gastos:
  la cabecera del día con su número grande, el día de la semana y lo que
  entró y salió; y en cada fila el grupo y la categoría a la izquierda, la
  descripción y la cuenta en medio, y el importe a la derecha.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import { accountLine, leftLabel, monthDot, sumOf, weekday, WEEKDAYS_SHORT } from "../../lib/mobile";
  import type { Pending } from "../../lib/outbox";
  import type { Transaction } from "../../lib/types";

  type Tx = Pending<Transaction>;

  let {
    txs,
    onOpen,
    empty = "Sin movimientos.",
  }: {
    txs: Tx[];
    onOpen: (t: Tx) => void;
    empty?: string;
  } = $props();

  const days = $derived.by(() => {
    const map = new Map<string, Tx[]>();
    for (const t of txs) {
      const d = t.date.slice(0, 10);
      const day = map.get(d);
      if (day) day.push(t);
      else map.set(d, [t]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  });
</script>

{#each days as [day, list] (day)}
  {@const dow = weekday(day)}
  <section class="d-day">
    <header class="d-head">
      <strong class="d-num">{Number(day.slice(8, 10))}</strong>
      <span class="d-dow" class:sun={dow === 0} class:sat={dow === 6}>{WEEKDAYS_SHORT[dow]}</span>
      <span class="d-month">{monthDot(day)}</span>
      <Money class="d-in" value={sumOf(list, "income")} tone="income" />
      <Money class="d-out" value={sumOf(list, "expense")} tone="expense" />
    </header>
    <ul>
      {#each list as t (t.id)}
        {@const [main, sub] = leftLabel(t)}
        <li>
          <button type="button" class="d-row" onclick={() => onOpen(t)}>
            <span class="d-left">
              <span>{main}</span>
              {#if sub}<span class="d-sub">{sub}</span>{/if}
            </span>
            <span class="d-mid">
              <span class="d-desc">{t.description || sub || main}</span>
              <span class="d-sub">
                {accountLine(t)}
                {#if t._error}
                  <span class="d-flag bad"><Icon name="alert-02" size={11} />No se pudo guardar</span>
                {:else if t._pending}
                  <span class="d-flag"><Icon name="clock-01" size={11} />Por enviar</span>
                {:else if t.dup_of}
                  <span class="d-flag warn"><Icon name="copy-01" size={11} />¿Repetido?</span>
                {:else if t.tags?.includes("revisar")}
                  <span class="d-flag warn">Por revisar</span>
                {/if}
              </span>
            </span>
            <Money class="d-amt" value={t.amount} tone={t.type === "transfer" ? undefined : t.type} />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="d-empty">{empty}</p>
{/each}

<style>
  .d-day {
    border-bottom: 0.5rem solid var(--bg-hover);
  }

  .d-head {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-10) var(--sp-16);
    border-bottom: 1px solid var(--border);

    & :global(.d-in),
    & :global(.d-out) {
      font-size: var(--text-sm);
      text-align: right;
    }

    & :global(.d-in) {
      min-width: 6.5rem;
    }
  }

  .d-num {
    font-family: var(--font-num);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
  }

  .d-dow {
    padding: 0.125rem var(--sp-6);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg-hover);
    font-size: var(--text-xs);
    color: var(--text-secondary);

    &.sun {
      background: var(--danger);
      color: #fff;
    }

    &.sat {
      background: var(--transfer);
      color: #fff;
    }
  }

  .d-month {
    font-family: var(--font-num);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .d-row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-10) var(--sp-16);
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;

    &:active {
      background: var(--bg-hover);
    }

    & :global(.d-amt) {
      font-size: var(--text-sm);
    }
  }

  .d-left,
  .d-mid {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .d-left {
    font-size: var(--text-sm);
    color: var(--text-muted);

    & > span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .d-desc,
  .d-sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .d-desc {
    font-size: var(--text-sm);
  }

  .d-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .d-flag {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    margin-left: var(--sp-4);

    &.warn {
      color: var(--warning, var(--accent));
    }

    &.bad {
      color: var(--danger);
    }
  }

  .d-empty {
    padding: var(--sp-40) var(--sp-16);
    color: var(--text-muted);
    text-align: center;
  }

  @media (max-width: 22rem) {
    .d-row {
      grid-template-columns: 5rem minmax(0, 1fr) auto;
    }

    .d-head :global(.d-in) {
      min-width: 0;
    }
  }
</style>
