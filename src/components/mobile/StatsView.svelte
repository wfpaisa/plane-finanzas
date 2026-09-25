<!--
  Estadísticas del celular. Arriba, el mes (o el año) repartido en un
  pastel: los gastos por grupo (fijos / variables) y los ingresos por
  categoría. Tocar una parte la abre: sus categorías con su porcentaje, cómo
  vino en los últimos meses y sus movimientos. Y de una categoría, lo mismo
  pero solo de ella.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import DayList from "./DayList.svelte";
  import MonthNav from "./MonthNav.svelte";
  import TopBar from "./TopBar.svelte";
  import { resolveColor } from "../../lib/colors";
  import { addMonths, today } from "../../lib/finance";
  import { money, monthName } from "../../lib/format";
  import { groupOf, GROUP_LABEL, hasGroups } from "../../lib/mobile";
  import { notify } from "../../lib/notify.svelte";
  import { cachedList, offline } from "../../lib/offline.svelte";
  import { overlay, type Pending } from "../../lib/outbox";
  import { pb } from "../../lib/pb.svelte";
  import { store } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";

  type Tx = Pending<Transaction>;

  let { onOpen }: { onOpen: (t: Tx) => void } = $props();

  let ym = $state(today().slice(0, 7));
  let yearly = $state(false);
  let kind = $state<"expense" | "income">("expense");
  /** Dónde se está: arriba, en un grupo o en una categoría. */
  let path = $state<{ group?: string; category?: string }>({});

  const year = $derived(Number(ym.slice(0, 4)));
  // Lo del periodo y lo de antes, para la línea: ocho meses o cinco años.
  const range = $derived<[string, string]>(
    yearly ? [`${year - 4}-01-01`, `${year + 1}-01-01`] : [`${addMonths(ym, -7)}-01`, `${addMonths(ym, 1)}-01`],
  );

  let serverTxs = $state<Transaction[]>([]);
  let loading = $state(true);

  $effect(() => {
    void store.txVersion;
    const [from, to] = range;
    let alive = true;
    loading = true;
    cachedList(
      `tx:${from}:${to}`,
      () =>
        pb.collection("transactions").getFullList<Transaction>({
          filter: pb.filter("date >= {:from} && date < {:to} && type != 'transfer'", { from, to }),
          sort: "-date,-created",
          batch: 1000,
        }),
      (list) => alive && (serverTxs = list),
    )
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  const all = $derived.by(() => {
    const [from, to] = range;
    return overlay("transactions", serverTxs, offline.items, (t) => {
      const d = t.date.slice(0, 10);
      return d >= from && d < to;
    }).filter((t) => t.type !== "transfer");
  });

  const inPeriod = (t: Tx) => (yearly ? t.date.slice(0, 4) === String(year) : t.date.slice(0, 7) === ym);
  const period = $derived(all.filter(inPeriod));

  const totalOf = (k: string) => period.filter((t) => t.type === k).reduce((s, t) => s + t.amount, 0);
  const incomeTotal = $derived(totalOf("income"));
  const expenseTotal = $derived(totalOf("expense"));

  const onPath = (t: Tx) =>
    t.type === kind &&
    (path.category !== undefined
      ? (t.category || "") === path.category
      : path.group !== undefined
        ? groupOf(t.category) === path.group
        : true);

  const filtered = $derived(period.filter(onPath));
  const filteredTotal = $derived(filtered.reduce((s, t) => s + t.amount, 0));

  /** Por grupo solo arriba y en gastos; si no, por categoría. */
  const byGroup = $derived(path.group === undefined && path.category === undefined && kind === "expense" && hasGroups());

  // Colores de las partes como CSS; la gráfica los resuelve al dibujar.
  const GROUP_TINT: Record<string, string> = { fijo: "var(--tinte-4)", variable: "var(--tinte-6)", "": "var(--tinte-10)" };
  const RAMP = [1, 4, 8, 6, 2, 9, 14, 12, 17, 13, 5, 11, 16, 3, 18, 15, 7, 20, 19, 10];

  function catColor(id: string, i: number) {
    const c = store.category(id)?.color ?? "";
    if (c.startsWith("tint-")) return `var(--tinte-${c.slice(5)})`;
    if (c.startsWith("#")) return c;
    return `var(--tinte-${RAMP[i % RAMP.length]})`;
  }

  const slices = $derived.by(() => {
    if (path.category !== undefined) return [];
    const map = new Map<string, number>();
    for (const t of filtered) {
      const k = byGroup ? groupOf(t.category) : t.category || "";
      map.set(k, (map.get(k) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .map(([key, total], i) => ({
        key,
        total,
        pct: filteredTotal ? (total / filteredTotal) * 100 : 0,
        label: byGroup ? (GROUP_LABEL[key] ?? key) : (store.category(key)?.name ?? "Sin categoría"),
        color: byGroup ? (GROUP_TINT[key] ?? GROUP_TINT[""]) : catColor(key, i),
      }));
  });

  function pick(key: string) {
    if (byGroup) path = { group: key };
    else path = { ...path, category: key };
  }

  function back() {
    // De una categoría se vuelve a su grupo si se llegó por él.
    if (path.category !== undefined && path.group !== undefined) path = { group: path.group };
    else path = {};
  }

  const title = $derived(
    path.category !== undefined
      ? (store.category(path.category)?.name ?? "Sin categoría")
      : path.group !== undefined
        ? (GROUP_LABEL[path.group] ?? path.group)
        : "",
  );

  const pctLabel = (n: number) => `${n >= 10 || n === 0 ? Math.round(n) : n.toFixed(1)}%`;

  const pieConfig = (): ChartConfiguration =>
    ({
      type: "pie",
      data: {
        labels: slices.map((s) => s.label),
        datasets: [{ data: slices.map((s) => s.total), backgroundColor: slices.map((s) => resolveColor(s.color)) }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(Number(c.raw))}` } },
        },
      },
    }) as ChartConfiguration;

  // La línea: el total del camino actual en cada mes (o año).
  const series = $derived.by(() => {
    const keys = yearly
      ? Array.from({ length: 5 }, (_, i) => String(year - 4 + i))
      : Array.from({ length: 8 }, (_, i) => addMonths(ym, i - 7));
    const sums = new Map(keys.map((k) => [k, 0]));
    for (const t of all) {
      if (!onPath(t)) continue;
      const k = yearly ? t.date.slice(0, 4) : t.date.slice(0, 7);
      if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + t.amount);
    }
    return keys.map((k) => ({ key: k, total: sums.get(k) ?? 0 }));
  });

  const lineColor = $derived(kind === "expense" ? "var(--danger)" : "var(--success)");

  const lineConfig = (): ChartConfiguration =>
    ({
      type: "line",
      data: {
        labels: series.map((s) => (yearly ? s.key : monthName(Number(s.key.slice(5))).slice(0, 3))),
        datasets: [{ data: series.map((s) => s.total), borderColor: resolveColor(lineColor), pointRadius: 3 }],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${money(Number(c.raw))}` } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 4,
              callback: (v) => {
                const n = Number(v);
                return n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);
              },
            },
          },
          x: { grid: { display: false } },
        },
      },
    }) as ChartConfiguration;
</script>

{#if path.group === undefined && path.category === undefined}
  <TopBar>
    <MonthNav bind:ym {yearly} />
    {#snippet actions()}
      <select class="st-period" aria-label="Periodo" bind:value={yearly}>
        <option value={false}>Mensual</option>
        <option value={true}>Anual</option>
      </select>
    {/snippet}
  </TopBar>

  <div class="st-tabs" role="tablist">
    <button type="button" role="tab" aria-selected={kind === "income"} class:on={kind === "income"} onclick={() => (kind = "income")}>
      Ingresos <Money value={incomeTotal} />
    </button>
    <button type="button" role="tab" aria-selected={kind === "expense"} class:on={kind === "expense"} onclick={() => (kind = "expense")}>
      Gastos <Money value={expenseTotal} />
    </button>
  </div>

  {#if slices.length}
    <div class="st-pie">
      {#key `${kind}${ym}${yearly}`}
        <Chart config={pieConfig} height={240} label="Reparto del periodo" />
      {/key}
    </div>
  {/if}

  <ul class="st-list">
    {#each slices as s (s.key)}
      <li>
        <button type="button" onclick={() => pick(s.key)}>
          <span class="st-pill" style:--c={s.color}>{pctLabel(s.pct)}</span>
          <span class="st-name">{s.label}</span>
          <Money value={s.total} />
        </button>
      </li>
    {:else}
      {#if !loading}<li class="st-empty">Nada en este periodo.</li>{/if}
    {/each}
  </ul>
{:else}
  <TopBar>
    <button type="button" class="btn-icon sm" aria-label="Volver" onclick={back}><Icon name="arrow-left-02" size={20} /></button>
    <span class="st-title">{title}</span>
    {#snippet actions()}
      <MonthNav bind:ym {yearly} />
    {/snippet}
  </TopBar>

  <div class="st-total">
    <span>{kind === "expense" ? "Gastos" : "Ingresos"} del {yearly ? "año" : "mes"}</span>
    <strong><Money value={filteredTotal} /></strong>
  </div>

  <ul class="st-rows">
    <li class="on"><span>Todas</span><span>100%</span><Money value={filteredTotal} /></li>
    {#each slices as s (s.key)}
      <li>
        <button type="button" onclick={() => pick(s.key)}>
          <span><i class="st-dot" style:--c={s.color}></i>{s.label}</span>
          <span>{pctLabel(s.pct)}</span>
          <Money value={s.total} />
        </button>
      </li>
    {/each}
  </ul>

  <div class="st-line">
    {#key `${kind}${ym}${yearly}${title}`}
      <Chart config={lineConfig} height={200} label="Evolución en el tiempo" />
    {/key}
  </div>

  <DayList txs={filtered} {onOpen} empty="Sin movimientos en este periodo." />
{/if}

<style>
  .st-period {
    padding: var(--sp-6) var(--sp-10);
    border: 1px solid var(--border-strong, var(--border));
    border-radius: var(--radius-md, 8px);
    background: var(--bg-field);
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .st-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--border);

    & button {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--sp-6);
      padding: var(--sp-12) var(--sp-8);
      border: 0;
      border-bottom: 3px solid transparent;
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-muted);
      cursor: pointer;

      &.on {
        border-bottom-color: var(--accent);
        color: var(--text-primary);
        font-weight: 600;
      }
    }
  }

  .st-pie {
    padding: var(--sp-16);
    border-bottom: 0.5rem solid var(--bg-hover);
  }

  .st-list,
  .st-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .st-list button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    padding: var(--sp-12) var(--sp-16);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;

    &:active {
      background: var(--bg-hover);
    }
  }

  .st-pill {
    min-width: 3.25rem;
    padding: 0.125rem var(--sp-6);
    border-radius: var(--radius-sm, 4px);
    background: var(--c);
    font-family: var(--font-num);
    font-size: var(--text-xs);
    color: oklch(0.2 0 0);
    text-align: center;
  }

  .st-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .st-empty {
    padding: var(--sp-40) var(--sp-16);
    color: var(--text-muted);
    text-align: center;
  }

  .st-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .st-total {
    display: flex;
    flex-direction: column;
    padding: var(--sp-16);
    border-bottom: 1px solid var(--border);

    & span {
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    & strong {
      font-size: 1.75rem;
      font-weight: 600;
    }
  }

  .st-rows li,
  .st-rows button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3.5rem auto;
    align-items: center;
    gap: var(--sp-12);
    font-size: var(--text-sm);
  }

  .st-rows li {
    border-bottom: 1px solid var(--border);

    &.on {
      padding: var(--sp-14, 0.875rem) var(--sp-16);
      background: color-mix(in oklch, var(--accent) 22%, transparent);
    }

    & > span:nth-child(2),
    & button > span:nth-child(2) {
      color: var(--text-muted);
      text-align: right;
    }
  }

  .st-rows button {
    grid-column: 1 / -1;
    width: 100%;
    padding: var(--sp-14, 0.875rem) var(--sp-16);
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;

    &:active {
      background: var(--bg-hover);
    }

    & > span:first-child {
      display: flex;
      align-items: center;
      gap: var(--sp-8);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .st-dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--c);
  }

  .st-line {
    padding: var(--sp-16) var(--sp-8) var(--sp-8);
    border-bottom: 0.5rem solid var(--bg-hover);
  }
</style>
