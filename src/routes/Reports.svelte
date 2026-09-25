<!--
  Estados: ingresos y gastos por semana (dentro de un mes), por mes (dentro
  de un año) o por año, y el reparto por categoría y por etiqueta. Tocar una
  categoría la aísla en la gráfica; elegir una etiqueta filtra toda la página.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Select } from "../components/ui";
  import { colorsFor, token } from "../lib/colors";
  import {
    addMonths,
    bucketize,
    byCategory,
    monthRange,
    monthsOfYear,
    today,
    weeksOfMonth,
    type Granularity,
    type Kind,
  } from "../lib/finance";
  import { money, monthLabel, weekLabel } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { pb } from "../lib/pb.svelte";
  import { go } from "../lib/router.svelte";
  import { keys as shortcuts } from "../lib/keys";
  import { store } from "../lib/store.svelte";
  import { byTag, categoryTags, hasTag } from "../lib/tags";
  import { tintFor } from "../lib/palettes";
  import Tag, { type Tone } from "../components/ui/Tag.svelte";
  import type { Transaction } from "../lib/types";

  const now = today();
  let g = $state<Granularity>("month");
  let ym = $state(now.slice(0, 7));
  let year = $state(Number(now.slice(0, 4)));
  let kind = $state<Kind | "both">("expense");
  let account = $state("");
  let tag = $state("");
  let focus = $state("");

  let txs = $state<Transaction[]>([]);
  let loading = $state(true);

  const range = $derived.by((): [string, string] => {
    if (g === "week") return monthRange(ym);
    if (g === "month") return [`${year}-01-01`, `${year + 1}-01-01`];
    return [`${year - 5}-01-01`, `${year + 1}-01-01`];
  });

  $effect(() => {
    void store.txVersion;
    const [a, b] = range;
    loading = true;
    pb.collection("transactions")
      .getFullList<Transaction>({
        filter: pb.filter(`date >= {:a} && date < {:b} && type != 'transfer'${account ? " && account = {:acc}" : ""}`, {
          a,
          b,
          acc: account,
        }),
        fields: "id,type,date,amount,category,account,tags",
        batch: 1000,
      })
      .then((r) => (txs = r))
      .catch(notify.fail)
      .finally(() => (loading = false));
  });

  const keys = $derived.by(() => {
    if (g === "week") return weeksOfMonth(ym);
    if (g === "month") return monthsOfYear(year);
    return Array.from({ length: 6 }, (_, i) => String(year - 5 + i));
  });

  // En semanal, la semana que empieza el mes anterior solo trae los días del mes.
  const inRange = $derived(
    txs.filter((t) => t.date.slice(0, 10) >= range[0] && t.date.slice(0, 10) < range[1] && (!tag || hasTag(t, tag))),
  );
  const focused = $derived(focus ? inRange.filter((t) => (t.category || "none") === focus) : inRange);
  const buckets = $derived(bucketize(focused, g, keys));
  const income = $derived(inRange.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
  const expense = $derived(inRange.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
  const savingRate = $derived(income > 0 ? ((income - expense) / income) * 100 : 0);
  const catKind = $derived<Kind>(kind === "income" ? "income" : "expense");
  const cats = $derived(byCategory(inRange, catKind));
  const catTotal = $derived(cats.reduce((s, c) => s + c.total, 0));
  const catMax = $derived(cats[0]?.total ?? 0);
  const tagRows = $derived(byTag(inRange.filter((t) => t.type === catKind)));
  const tagMax = $derived(Math.max(0, ...tagRows.map((r) => r.total)));
  const tagOptions = $derived([...new Set([...categoryTags(), ...txs.flatMap((t) => t.tags ?? [])])].sort());
  const periods = $derived(g === "week" ? 1 : g === "month" ? 12 : 6);

  const label = (k: string) => (g === "week" ? weekLabel(k) : g === "month" ? monthLabel(k) : k);

  const chartConfig = (): ChartConfiguration => {
    const focusCat = focus ? store.category(focus) : null;
    // Con una categoría elegida, sus barras van en el color de ella.
    const own = focusCat ? colorsFor([focusCat.color])[0] : null;
    const inc = own ?? token("--viz-income");
    const exp = own ?? token("--viz-expense");
    const datasets: ChartConfiguration<"bar" | "line">["data"]["datasets"] = [];
    if (kind !== "expense")
      datasets.push({ type: "bar", label: "Ingresos", data: buckets.map((b) => b.income), backgroundColor: inc, borderRadius: 4, maxBarThickness: 28 });
    if (kind !== "income")
      datasets.push({ type: "bar", label: "Gastos", data: buckets.map((b) => b.expense), backgroundColor: exp, borderRadius: 4, maxBarThickness: 28 });
    if (kind === "both" && !focus)
      datasets.push({
        type: "line",
        label: "Ingresos menos gastos",
        data: buckets.map((b) => b.net),
        borderColor: token("--viz-line"),
        backgroundColor: token("--viz-line"),
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.3,
      });
    return {
      type: "bar",
      data: { labels: buckets.map((b) => label(b.key)), datasets },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: "top", align: "end" },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
        },
      },
    } as ChartConfiguration;
  };

  const doughnutConfig = (): ChartConfiguration =>
  ({
    type: "doughnut",
    data: {
      labels: cats.map((c) => store.category(c.category)?.name ?? "Sin categoría"),
      datasets: [
        {
          data: cats.map((c) => c.total),
          backgroundColor: colorsFor(cats.map((c) => store.category(c.category)?.color)),
          borderColor: token("--bg-level2"),
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(Number(c.raw))}` } },
      },
    },
  }) as ChartConfiguration;

  const step = (d: number) => {
    if (g === "week") ym = addMonths(ym, d);
    else year += d;
  };
  const onKey = shortcuts({
    s: () => (g = "week"),
    m: () => (g = "month"),
    a: () => (g = "year"),
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    h: () => {
      ym = now.slice(0, 7);
      year = Number(now.slice(0, 4));
    },
  });

  const title = $derived(g === "week" ? monthLabel(ym, true) : g === "month" ? String(year) : `${year - 5} – ${year}`);
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
  <header class="page-head">
    <div>
      <h1>Análisis de ingresos y gastos</h1>
      <p>Compara cuánto dinero entró y salió en {title}.</p>
    </div>
    <div class="page-actions">
      <Segmented
        bind:value={g}
        options={[
          { id: "week", label: "Semanal" },
          { id: "month", label: "Mensual" },
          { id: "year", label: "Anual" },
        ]}
        label="Periodo"
      />
    </div>
  </header>

  <div class="toolbar card">
    {#if g === "week"}
      <div class="nav">
        <button type="button" class="btn-icon sm" aria-label="Mes anterior" data-tip="Mes anterior (←)" onclick={() => (ym = addMonths(ym, -1))}><Icon name="arrow-left-01" /></button>
        <input type="month" class="field-control sm" bind:value={ym} />
        <button type="button" class="btn-icon sm" aria-label="Mes siguiente" data-tip="Mes siguiente (→)" onclick={() => (ym = addMonths(ym, 1))}><Icon name="arrow-right-01" /></button>
      </div>
    {:else}
      <div class="nav">
        <button type="button" class="btn-icon sm" aria-label="Año anterior" data-tip="Año anterior (←)" onclick={() => year--}><Icon name="arrow-left-01" /></button>
        <b class="nav-year">{g === "year" ? `hasta ${year}` : year}</b>
        <button type="button" class="btn-icon sm" aria-label="Año siguiente" data-tip="Año siguiente (→)" onclick={() => year++}><Icon name="arrow-right-01" /></button>
      </div>
    {/if}
    <Segmented
      bind:value={kind}
      options={[
        { id: "expense", label: "Gastos" },
        { id: "income", label: "Ingresos" },
        { id: "both", label: "Ambos" },
      ]}
      label="Qué ver"
    />
    <div class="toolbar-account">
      {#if tagOptions.length || tag}
        <Select bind:value={tag} class="sm" aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {#each tagOptions as t (t)}<option value={t}>#{t}</option>{/each}
        </Select>
      {/if}
      <Select bind:value={account} class="sm">
        <option value="">Todas las cuentas</option>
        {#each store.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </Select>
    </div>
  </div>

  <div class="stack">
    <div class="kpis-auto">
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-income"><Icon name="money-receive-01" /></span><span class="kpi-label">Ingresos</span></div>
        <div class="kpi-val"><Money value={income} tone="income" /></div>
        <div class="kpi-foot">Promedio <Money value={income / periods} /> por {g === "week" ? "mes" : g === "month" ? "mes" : "año"}</div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-expense"><Icon name="money-send-01" /></span><span class="kpi-label">Gastos</span></div>
        <div class="kpi-val"><Money value={expense} tone="expense" /></div>
        <div class="kpi-foot">Promedio <Money value={expense / periods} /> por {g === "year" ? "año" : "mes"}</div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico"><Icon name="coins-01" /></span><span class="kpi-label">Ingresos menos gastos</span></div>
        <div class="kpi-val"><Money value={income - expense} tone="auto" /></div>
        <div class="kpi-foot">{income > 0 ? `Guardaste el ${Math.round(savingRate)}% de lo que entró` : "Sin ingresos en el periodo"}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">{kind === "income" ? "Ingresos" : kind === "expense" ? "Gastos" : "Ingresos y gastos"} por {g === "week" ? "semana" : g === "month" ? "mes" : "año"}</h3>
          {#if focus}
            <p class="card-sub">Solo <CategoryPill id={focus === "none" ? "" : focus} onclick={() => (focus = "")} /> · toca para quitar</p>
          {/if}
        </div>
      </div>
      <div class="card-body">
        {#if !loading}<Chart config={chartConfig} height={280} label="Ingresos y gastos por periodo" />{/if}
      </div>
    </div>

    <div class="split">
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Por categoría</h3>
            <p class="card-sub">
              {catKind === "income" ? "Ingresos" : "Gastos"} · <Money value={catTotal} /> en {cats.length}
              {cats.length === 1 ? "categoría" : "categorías"}
            </p>
          </div>
          {#if focus}
            <div class="card-head-actions">
              <button type="button" class="link small" onclick={() => (focus = "")}>Ver todas en la gráfica</button>
            </div>
          {/if}
        </div>
        <div class="card-body">
          {#if cats.length}
            <!--
              Tocar la fila aísla la categoría en la gráfica de arriba; la
              flecha abre sus movimientos. La barra se mide contra la más
              grande, o contra el límite mensual si la categoría tiene uno.
            -->
            <ul class="cr-list">
              {#each cats as c (c.category)}
                {@const cat = store.category(c.category)}
                {@const key = c.category || "none"}
                {@const tint = cat?.color || "tint-10"}
                {@const budget = (cat?.budget ?? 0) * (g === "year" ? 72 : g === "month" ? 12 : 1)}
                {@const over = budget > 0 && c.total > budget}
                {@const share = catTotal ? (c.total / catTotal) * 100 : 0}
                <li class="cr" class:dim={focus && focus !== key} class:on={focus === key}>
                  <button
                    type="button"
                    class="cr-main"
                    aria-pressed={focus === key}
                    data-tip={focus === key ? "Quitar de la gráfica" : "Ver solo esta en la gráfica"}
                    onclick={() => (focus = focus === key ? "" : key)}
                  >
                    <span class="cr-ico {tint}"><Icon name={cat?.icon || "tag-01"} size={16} /></span>
                    <span class="cr-text">
                      <span class="cr-name">{cat?.name ?? "Sin categoría"}</span>
                      <span class="cr-meta">{c.count} {c.count === 1 ? "movimiento" : "movimientos"}</span>
                    </span>
                    <span class="cr-amount">
                      <Money value={c.total} />
                      <span class="cr-meta">{share >= 10 || share === 0 ? Math.round(share) : share.toFixed(1)}%</span>
                    </span>
                    <span class="cr-bar {tint}" class:over>
                      <span style:width="{budget > 0 ? Math.min(100, (c.total / budget) * 100) : catMax ? (c.total / catMax) * 100 : 0}%"></span>
                    </span>
                    {#if budget > 0}
                      <span class="cr-budget" class:over>
                        {#if over}Te pasaste <Money value={c.total - budget} /> del límite de <Money value={budget} />
                        {:else}Quedan <Money value={budget - c.total} /> de <Money value={budget} />{/if}
                      </span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="btn-icon sm cr-go"
                    aria-label="Ver movimientos de {cat?.name ?? 'Sin categoría'}"
                    data-tip="Ver movimientos"
                    onclick={() => go("/movimientos", { cat: key, mes: g === "week" ? ym : "todo", ...(tag ? { tag } : {}) })}
                  >
                    <Icon name="arrow-right-01" size={14} />
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="empty-card">Nada en este periodo.</div>
          {/if}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3 class="card-title">Reparto</h3></div></div>
        <div class="card-body">
          {#if cats.length}
            <Chart config={doughnutConfig} height={260} label="Reparto por categoría" />
          {/if}
          <table class="mini-table">
            <thead><tr><th>Periodo</th><th>Ingresos</th><th>Gastos</th></tr></thead>
            <tbody>
              {#each bucketize(inRange, g, keys) as b (b.key)}
                <tr>
                  <td>{label(b.key)}</td>
                  <td><Money value={b.income} /></td>
                  <td><Money value={b.expense} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Por etiqueta</h3>
          <p class="card-sub">
            {catKind === "income" ? "Ingresos" : "Gastos"} por etiqueta, propia o de la categoría. Un movimiento con varias suma en cada una.
          </p>
        </div>
      </div>
      <div class="card-body">
        {#each tagRows as row (row.tag)}
          <div class="bar-row tag-row" class:dim={tag && tag !== row.tag}>
            <span class="cat-name">
              {#if row.tag}
                <Tag tone={tintFor(row.tag) as Tone} pressed={tag === row.tag} onclick={() => (tag = tag === row.tag ? "" : row.tag)}>#{row.tag}</Tag>
              {:else}
                <span class="muted">Sin etiqueta</span>
              {/if}
              <span class="muted small">{row.count} mov.</span>
            </span>
            <span class="cat-amount">
              <Money value={row.total} />
              <span class="muted small">{catTotal ? Math.round((row.total / catTotal) * 100) : 0}%</span>
            </span>
            <div class="bar-track {row.tag ? tintFor(row.tag) : 'tint-10'}">
              <span style:width="{tagMax ? (row.total / tagMax) * 100 : 0}%"></span>
            </div>
          </div>
        {:else}
          <div class="empty-card">Nada en este periodo.</div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-12);
    margin-bottom: var(--sp-16);
    padding: var(--sp-10) var(--sp-14);
  }

  .toolbar-account {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
    margin-left: auto;

    /* Cada select con su ancho: si se reparten el de la caja, el texto se
       parte en dos renglones. */
    & :global(select) {
      flex: 1 0 auto;
      width: auto;
      min-width: 11rem;
      white-space: nowrap;
    }
  }

  .tag-row {
    transition: opacity 0.2s;

    &.dim {
      opacity: 0.4;
    }
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--sp-4);

    & input {
      width: 10rem;
    }
  }

  .nav-year {
    min-width: 5rem;
    text-align: center;
  }

  .cat-name {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
  }

  .cat-amount {
    display: flex;
    align-items: baseline;
    gap: var(--sp-6);
    font-weight: 600;
    color: var(--text-primary);
  }

  .mini-table {
    width: 100%;
    margin-top: var(--sp-16);
    border-collapse: collapse;
    font-size: var(--text-xs);

    & th {
      text-align: left;
      font-weight: 600;
      color: var(--text-muted);
      padding: var(--sp-4) 0;
      border-bottom: var(--border-width) solid var(--border);
    }

    & td {
      padding: var(--sp-4) 0;
      color: var(--text-secondary);
    }
  }
</style>
