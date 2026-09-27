<!--
  Análisis del celular. Arriba, el mes (o el año) por categoría, en un
  pastel, o por etiqueta, en lista: un movimiento con varias etiquetas suma
  en cada una y ahí un pastel mentiría. Tocar una parte la abre: sus
  categorías con su porcentaje, cómo vino en los últimos meses y sus
  movimientos. Y de una categoría, lo mismo pero solo de ella.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import Segmented from "../app/Segmented.svelte";
  import DayList from "./DayList.svelte";
  import MonthNav from "./MonthNav.svelte";
  import MonthSwipe from "./MonthSwipe.svelte";
  import SlideIn from "./SlideIn.svelte";
  import TopBar from "./TopBar.svelte";
  import { resolveColor } from "../../lib/colors";
  import { addMonths, today } from "../../lib/finance";
  import { money, monthName } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { cachedList, offline } from "../../lib/offline.svelte";
  import { overlay, type Pending } from "../../lib/outbox";
  import { pb } from "../../lib/pb.svelte";
  import { goBack, route } from "../../lib/router.svelte";
  import { store } from "../../lib/store.svelte";
  import { byTag, hasTag, tagsOf } from "../../lib/tags";
  import { tintFor } from "../../lib/palettes";
  import type { Transaction } from "../../lib/types";

  type Tx = Pending<Transaction>;

  let { onOpen }: { onOpen: (t: Tx) => void } = $props();

  let ym = $state(today().slice(0, 7));
  let yearly = $state(false);
  let kind = $state<"expense" | "income">("expense");
  /**
   * Dónde se está: arriba, en una etiqueta o en una categoría. Va en la ruta
   * (`#/m?etiqueta=…&categoria=…`, "" es "sin …") para que el botón de atrás
   * del teléfono suba un nivel.
   */
  const path = $derived.by(() => {
    const q = route.query;
    return {
      tag: q.has("etiqueta") ? (q.get("etiqueta") ?? "") : undefined,
      category: q.has("categoria") ? (q.get("categoria") ?? "") : undefined,
    };
  });
  const hashOf = (p: { tag?: string; category?: string }) => {
    const q = new URLSearchParams();
    if (p.tag !== undefined) q.set("etiqueta", p.tag);
    if (p.category !== undefined) q.set("categoria", p.category);
    const s = q.toString();
    return `#/m${s ? `?${s}` : ""}`;
  };
  /** Arriba, por categoría o por etiqueta. */
  let by = $state<"category" | "tag">("category");

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

  /** "" es "sin etiqueta". */
  const inTag = (t: Tx, tag: string) => (tag ? hasTag(t, tag) : !tagsOf(t).length);

  const onPath = (t: Tx) =>
    t.type === kind &&
    (path.tag === undefined || inTag(t, path.tag)) &&
    (path.category === undefined || (t.category || "") === path.category);

  const filtered = $derived(period.filter(onPath));
  const filteredTotal = $derived(filtered.reduce((s, t) => s + t.amount, 0));

  const top = $derived(path.tag === undefined && path.category === undefined);
  /** Por etiqueta solo arriba; dentro de una etiqueta, por categoría. */
  const byTags = $derived(top && by === "tag");

  // Colores de las partes como CSS; la gráfica los resuelve al dibujar.
  const tagColor = (tag: string) => (tag ? `var(--tinte-${tintFor(tag).slice(5)})` : "var(--tinte-10)");
  const RAMP = [1, 4, 8, 6, 2, 9, 14, 12, 17, 13, 5, 11, 16, 3, 18, 15, 7, 20, 19, 10];

  function catColor(id: string, i: number) {
    const c = store.category(id)?.color ?? "";
    if (c.startsWith("tint-")) return `var(--tinte-${c.slice(5)})`;
    if (c.startsWith("#")) return c;
    return `var(--tinte-${RAMP[i % RAMP.length]})`;
  }

  const slices = $derived.by(() => {
    if (path.category !== undefined) return [];
    if (byTags)
      return byTag(filtered).map((row) => ({
        key: row.tag,
        total: row.total,
        pct: filteredTotal ? (row.total / filteredTotal) * 100 : 0,
        label: row.tag ? `#${row.tag}` : "Sin etiqueta",
        color: tagColor(row.tag),
      }));
    const map = new Map<string, number>();
    for (const t of filtered) {
      const k = t.category || "";
      map.set(k, (map.get(k) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .map(([key, total], i) => ({
        key,
        total,
        pct: filteredTotal ? (total / filteredTotal) * 100 : 0,
        label: store.category(key)?.name ?? "Sin categoría",
        color: catColor(key, i),
      }));
  });

  function pick(key: string) {
    location.hash = hashOf(byTags ? { tag: key } : { ...path, category: key });
  }

  // De una categoría se vuelve a su etiqueta si se llegó por ella.
  const back = () => goBack(hashOf(path.category !== undefined && path.tag !== undefined ? { tag: path.tag } : {}));

  const title = $derived(
    path.category !== undefined
      ? (store.category(path.category)?.name ?? "Sin categoría")
      : path.tag !== undefined
        ? path.tag
          ? `#${path.tag}`
          : "Sin etiqueta"
        : "",
  );

  const pctLabel = (n: number) => `${n >= 10 || n === 0 ? Math.round(n) : n.toFixed(1)}%`;

  const pieConfig = (): ChartConfiguration =>
    ({
      // La dona del resumen de escritorio, con el total en el centro.
      type: "doughnut",
      data: {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => s.total),
            backgroundColor: slices.map((s) => resolveColor(s.color)),
            borderColor: resolveColor("var(--bg-level2)"),
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        cutout: "68%",
        // Tocar una parte la abre, igual que su fila de la lista.
        onClick: (_e, els) => {
          const s = els[0] && slices[els[0].index];
          if (s) pick(s.key);
        },
        onHover: (e, els) => {
          const el = e.native?.target as HTMLElement | undefined;
          if (el) el.style.cursor = els.length ? "pointer" : "";
        },
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

{#if top}
  <TopBar>
    <MonthNav bind:ym {yearly} />
    {#snippet actions()}
      <select class="st-period" aria-label="Periodo" bind:value={yearly}>
        <option value={false}>Mensual</option>
        <option value={true}>Anual</option>
      </select>
    {/snippet}
  </TopBar>

  <MonthSwipe bind:ym step={yearly ? 12 : 1}>
    <div class="st-tabs">
      <Segmented
        bind:value={kind}
        tabs
        full
        label="Tipo"
        options={[
          { id: "expense", label: "Gastos", sub: money(expenseTotal) },
          { id: "income", label: "Ingresos", sub: money(incomeTotal) },
        ]}
      />
    </div>

    <div class="st-by">
      <Segmented
        bind:value={by}
        full
        label="Repartir por"
        options={[
          { id: "category", label: "Por categoría" },
          { id: "tag", label: "Por etiqueta" },
        ]}
      />
      {#if byTags}<p>Un movimiento con varias etiquetas suma en cada una.</p>{/if}
    </div>

    <SlideIn key={kind} order={["expense", "income"]}>
      <SlideIn key={by} order={["category", "tag"]}>
        {#if slices.length && !byTags}
          <div class="card st-pie">
            <div class="st-card-head">
              <h3 class="card-title">{kind === "expense" ? "¿En qué gastaste?" : "¿De dónde entró?"}</h3>
              <p class="card-sub">Toca una parte para ver su detalle</p>
            </div>
            <div class="st-donut">
              {#key `${kind}${ym}${yearly}${by}`}
                <Chart config={pieConfig} height={220} label="Reparto del periodo" />
              {/key}
              <div class="st-donut-total">
                <span>Total</span>
                <Money value={filteredTotal} tone={kind} />
              </div>
            </div>
          </div>
        {/if}

        {#if slices.length}
          <ul class="card st-list">
            {#each slices as s (s.key)}
              <li>
                <button type="button" onclick={() => pick(s.key)}>
                  <span class="st-pill" style:--c={s.color}>{pctLabel(s.pct)}</span>
                  <span class="st-name">
                    <span>{s.label}</span>
                    <span class="st-bar"><span style:width="{Math.min(100, s.pct)}%" style:--c={s.color}></span></span>
                  </span>
                  <Money value={s.total} />
                  <Icon name="arrow-right-01" size={14} />
                </button>
              </li>
            {/each}
          </ul>
        {:else if !loading}
          <p class="st-empty">Nada en este periodo.</p>
        {/if}
      </SlideIn>
    </SlideIn>
  </MonthSwipe>
{:else}
  <TopBar>
    <button type="button" class="btn-icon sm" aria-label="Volver" onclick={back}><Icon name="arrow-left-02" size={20} /></button>
    <span class="st-title">{title}</span>
    {#snippet actions()}
      <MonthNav bind:ym {yearly} />
    {/snippet}
  </TopBar>

  <MonthSwipe bind:ym step={yearly ? 12 : 1}>
    <div class="card kpi st-total">
      <div class="kpi-head">
        <span class="kpi-ico {kind === 'expense' ? 'tone-expense' : 'tone-income'}"
          ><Icon name={kind === "expense" ? "money-send-01" : "money-receive-01"} /></span
        >
        <span class="kpi-label">{kind === "expense" ? "Gastos" : "Ingresos"} del {yearly ? "año" : "mes"}</span>
      </div>
      <div class="kpi-val"><Money value={filteredTotal} tone={kind} /></div>
    </div>

    <ul class="card st-rows">
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

    <div class="card st-line">
      <div class="st-card-head">
        <h3 class="card-title">Cómo ha venido</h3>
        <p class="card-sub">{yearly ? "Últimos cinco años" : "Últimos ocho meses"}</p>
      </div>
      {#key `${kind}${ym}${yearly}${title}`}
        <Chart config={lineConfig} height={200} label="Evolución en el tiempo" />
      {/key}
    </div>

    <DayList txs={filtered} {onOpen} empty="Sin movimientos en este periodo." />
  </MonthSwipe>
{/if}

<style>
  /* El periodo, en una píldora como los botones de escritorio. */
  .st-period {
    min-height: 2.25rem;
    padding: 0 var(--sp-12);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--bg-field);
    box-shadow: var(--pillow);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .st-tabs {
    padding: var(--sp-12) var(--sp-12) 0;
    font-size: var(--text-sm);

    & :global(.seg-sub) {
      font-size: var(--text-xs);
    }
  }

  .st-by {
    display: grid;
    gap: var(--sp-6);
    padding: var(--sp-10) var(--sp-12) var(--sp-12);

    & p {
      margin: 0;
      padding: 0 var(--sp-4);
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .st-card-head {
    padding: 0 var(--sp-4) var(--sp-10);

    & h3,
    & p {
      margin: 0;
    }

    & p {
      font-size: var(--text-xs);
    }
  }

  .st-donut {
    position: relative;
  }

  .st-donut-total {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;

    & span {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    & :global(.money) {
      font-size: var(--text-lg, 1.125rem);
      font-weight: 600;
    }
  }

  .st-pie,
  .st-line {
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-16) var(--sp-16) var(--sp-12);
  }

  .st-list,
  .st-rows {
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-4) 0;
    overflow: hidden;
    list-style: none;
  }

  .st-list li + li button,
  .st-rows li + li {
    box-shadow: inset 0 1px 0 var(--border);
  }

  .st-list button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    min-height: 3.5rem;
    padding: var(--sp-10) var(--sp-12) var(--sp-10) var(--sp-16);
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:active {
      background: var(--bg-hover);
    }

    & > :global(i:last-child) {
      color: var(--text-muted);
    }
  }

  .st-pill {
    min-width: 3.25rem;
    padding: 0.125rem var(--sp-6);
    border-radius: var(--radius-pill);
    background: var(--c);
    font-family: var(--font-num);
    font-size: var(--text-xs);
    font-weight: 600;
    color: oklch(0.2 0 0);
    text-align: center;
  }

  .st-name {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;

    & > span:first-child {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  /* Cuánto pesa, en una barra fina como las de "Por categoría" en escritorio. */
  .st-bar {
    height: 0.25rem;
    border-radius: var(--radius-pill);
    background: var(--bg-hover);
    overflow: hidden;

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--c);
    }
  }

  .st-empty {
    margin: 0 var(--sp-12);
    padding: var(--sp-40) var(--sp-16);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }

  .st-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .st-total {
    margin: var(--sp-12) var(--sp-12);
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
    &.on {
      padding: var(--sp-14, 0.875rem) var(--sp-16);
      font-weight: 600;
    }

    & > span:nth-child(2),
    & button > span:nth-child(2) {
      color: var(--text-muted);
      font-weight: 400;
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
</style>
