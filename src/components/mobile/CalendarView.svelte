<!--
  El mes en un calendario de lunes a domingo: en cada día lo que entró, lo
  que salió y, si hubo transferencias, lo que se movió. Los días de los
  meses vecinos que completan las semanas van apagados. Tocar un día lo abre.
-->
<script lang="ts">
  import { monthRange, today, weekStart, ymd } from "../../lib/finance";
  import { plainNumber } from "../../lib/format";
  import { dayDot } from "../../lib/mobile";
  import type { Transaction } from "../../lib/types";

  let {
    ym,
    txs,
    onPick,
  }: {
    ym: string;
    /** Los movimientos de todas las semanas que se ven, no solo del mes. */
    txs: Transaction[];
    onPick: (day: string) => void;
  } = $props();

  const HEAD = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  const now = today();

  const cells = $derived.by(() => {
    const [first, next] = monthRange(ym);
    const [y, m, d] = weekStart(first).split("-").map(Number);
    const out: string[] = [];
    for (let i = 0; ; i++) {
      const day = ymd(new Date(y, m - 1, d + i));
      if (day >= next && i % 7 === 0) break;
      out.push(day);
    }
    return out;
  });

  const sums = $derived.by(() => {
    const map = new Map<string, { income: number; expense: number; transfer: number }>();
    for (const t of txs) {
      const k = t.date.slice(0, 10);
      const e = map.get(k) ?? { income: 0, expense: 0, transfer: 0 };
      e[t.type] += t.amount;
      map.set(k, e);
    }
    return map;
  });
</script>

<div class="cal">
  {#each HEAD as h, i (h)}
    <span class="cal-h" class:sat={i === 5} class:sun={i === 6}>{h}</span>
  {/each}
  {#each cells as day, i (day)}
    {@const s = sums.get(day)}
    {@const out = day.slice(0, 7) !== ym}
    <button
      type="button"
      class="cal-d"
      class:out
      class:today={day === now}
      aria-label={day}
      onclick={() => onPick(day)}
    >
      <span class="cal-n" class:sat={i % 7 === 5} class:sun={i % 7 === 6}>
        {day.endsWith("-01") ? dayDot(day) : Number(day.slice(8))}
      </span>
      {#if s?.income}<span class="cal-v in">{plainNumber(s.income)}</span>{/if}
      {#if s?.expense}<span class="cal-v ex">{plainNumber(s.expense)}</span>{/if}
      {#if s?.transfer}<span class="cal-v tr">{plainNumber(s.transfer)}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .cal {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    border-top: 1px solid var(--border);
  }

  .cal-h {
    padding: var(--sp-4) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    text-align: center;
  }

  .sat {
    color: var(--transfer);
  }

  .sun {
    color: var(--danger);
  }

  .cal-d {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.125rem;
    min-width: 0;
    min-height: 5.5rem;
    padding: var(--sp-4) 0.1875rem;
    border: 0;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: right;
    cursor: pointer;

    &:nth-child(7n) {
      border-right: 0;
    }

    &:active {
      background: var(--bg-hover);
    }

    &.out {
      background: var(--bg-hover);
      opacity: 0.55;
    }

    &.today .cal-n {
      align-self: flex-start;
      padding: 0 0.3125rem;
      border-radius: var(--radius-pill, 99px);
      background: var(--accent);
      color: var(--accent-text);
    }
  }

  .cal-n {
    margin-bottom: auto;
    font-size: var(--text-xs);
    text-align: left;
  }

  .cal-v {
    overflow: hidden;
    font-family: var(--font-num);
    font-size: 0.625rem;
    letter-spacing: -0.02em;
    white-space: nowrap;
    text-overflow: ellipsis;

    &.in {
      color: var(--success);
    }

    &.ex {
      color: var(--danger);
    }

    &.tr {
      color: var(--text-secondary);
    }
  }
</style>
