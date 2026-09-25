<!--
  El año mes por mes: lo que entró, lo que salió y lo que quedó. El mes que
  se está viendo se abre en sus semanas. Tocar un mes lo abre en el diario.
-->
<script lang="ts">
  import Money from "../app/Money.svelte";
  import { bucketize, monthRange, monthsOfYear, today, weeksOfMonth, ymd } from "../../lib/finance";
  import { monthName } from "../../lib/format";
  import { dayDot } from "../../lib/mobile";
  import type { Transaction } from "../../lib/types";

  let {
    ym,
    txs,
    onPick,
  }: {
    ym: string;
    /** Los movimientos del año. */
    txs: Transaction[];
    onPick: (ym: string) => void;
  } = $props();

  // Abierto: el que la persona tocó o, si no ha tocado ninguno, el que se ve.
  let touched = $state<string | null>(null);
  const open = $derived(touched ?? ym);

  // Los meses que ya pasaron, y los que vienen solo si ya tienen algo.
  const thisMonth = today().slice(0, 7);
  const months = $derived(
    bucketize(txs, "month", monthsOfYear(Number(ym.slice(0, 4))))
      .filter((b) => b.key <= thisMonth || b.income || b.expense)
      .toReversed(),
  );

  function weeks(month: string) {
    const [first, next] = monthRange(month);
    const inMonth = txs.filter((t) => t.date.slice(0, 7) === month);
    const rows = bucketize(inMonth, "week", weeksOfMonth(month));
    return rows
      .map((b) => {
        const [y, m, d] = b.key.split("-").map(Number);
        const from = b.key < first ? first : b.key;
        let to = ymd(new Date(y, m - 1, d + 6));
        if (to >= next) to = lastOf(month);
        return { ...b, range: `${dayDot(from)} ~ ${dayDot(to)}` };
      })
      .toReversed();
  }

  /** El último día de un mes: el día cero del siguiente. */
  function lastOf(month: string) {
    const [y, m] = month.split("-").map(Number);
    return ymd(new Date(y, m, 0));
  }
</script>

<ul class="mo">
  {#each months as b (b.key)}
    {@const isOpen = open === b.key}
    <li>
      <button type="button" class="mo-row" class:on={isOpen} onclick={() => (touched = isOpen ? "" : b.key)}>
        <span class="mo-name">
          <strong>{monthName(Number(b.key.slice(5))).slice(0, 3)}</strong>
          <span>{dayDot(`${b.key}-01`)} ~ {dayDot(lastOf(b.key))}</span>
        </span>
        <Money value={b.income} tone="income" />
        <span class="mo-right">
          <Money value={b.expense} tone="expense" />
          <Money class="mo-net" value={b.net} />
        </span>
      </button>
      {#if isOpen}
        <ul class="mo-weeks">
          {#each weeks(b.key) as w (w.key)}
            <li class="mo-week">
              <span>{w.range}</span>
              <Money value={w.income} tone="income" />
              <span class="mo-right">
                <Money value={w.expense} tone="expense" />
                <Money class="mo-net" value={w.net} />
              </span>
            </li>
          {/each}
          <li>
            <button type="button" class="mo-go" onclick={() => onPick(b.key)}>Ver el diario de {monthName(Number(b.key.slice(5)))}</button>
          </li>
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .mo,
  .mo-weeks {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mo-row,
  .mo-week {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 7rem;
    align-items: center;
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-12) var(--sp-16);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-align: left;
  }

  .mo-row {
    cursor: pointer;

    &.on {
      background: var(--bg-hover);
    }
  }

  .mo-name {
    display: flex;
    flex-direction: column;

    & strong {
      font-size: 1.0625rem;
      text-transform: capitalize;
    }

    & span {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .mo-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;

    & :global(.mo-net) {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .mo-week {
    padding-left: var(--sp-28, 1.75rem);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .mo-go {
    width: 100%;
    padding: var(--sp-10);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--accent);
    cursor: pointer;
  }
</style>
