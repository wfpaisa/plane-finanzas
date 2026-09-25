<!--
  Estados: ingresos y gastos por semana (dentro de un mes), por mes (dentro
  de un año) o por año, y el reparto por categoría y por etiqueta. Tocar una
  categoría la aísla en la gráfica; elegir una etiqueta filtra toda la página.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import MoneyFlow from "../components/app/MoneyFlow.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { MonthPicker, Select } from "../components/ui";
  import { change, cumulative, insights, previousPeriod, topN, type FlowItem } from "../lib/analysis";
  import { alpha, colorsFor, token } from "../lib/colors";
  import {
    addMonths,
    bucketize,
    byCategory,
    lastDayOf,
    monthRange,
    monthsOfYear,
    periodSpan,
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

  // Con qué se compara: el mes o el año anterior (ver `previousPeriod`).
  const prev = $derived(previousPeriod(g, ym, year, now));

  $effect(() => {
    void store.txVersion;
    const [a, b] = [prev?.full[0] ?? range[0], range[1]];
    // Al pasar rápido de un año a otro, solo vale la respuesta del último.
    let alive = true;
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
      .then((r) => alive && (txs = r))
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
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
  // Lo del periodo anterior hasta el mismo punto, con los mismos filtros.
  const inPrev = $derived(
    prev ? txs.filter((t) => t.date.slice(0, 10) >= prev.same[0] && t.date.slice(0, 10) < prev.same[1] && (!tag || hasTag(t, tag))) : [],
  );
  const prevIncome = $derived(inPrev.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
  const prevExpense = $derived(inPrev.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
  const prevCats = $derived(new Map(byCategory(inPrev, catKind).map((c) => [c.category || "none", c.total])));
  const catName = (id: string) => store.category(id)?.name ?? "Sin categoría";

  const summary = $derived(
    insights({
      kind: catKind,
      income,
      expense,
      prev: prev && inPrev.length ? { income: prevIncome, expense: prevExpense, name: prev.name, ongoing: prev.ongoing } : null,
      cats: cats.map((c) => ({ name: catName(c.category), total: c.total })),
      prevCats: new Map([...prevCats].map(([k, v]) => [catName(k === "none" ? "" : k), v])),
    }),
  );

  // A dónde fue el dinero: lo que entró por categoría y a dónde salió,
  // más lo que quedó o lo que faltó para que los dos lados cuadren.
  const flowLeft = $derived.by((): FlowItem[] => {
    const items = byCategory(inRange, "income").map((c) => ({
      id: c.category || "none",
      label: catName(c.category),
      value: c.total,
      tint: store.category(c.category)?.color || "tint-10",
    }));
    const out = topN(items, 4, { id: "_rest", label: "Otros ingresos", tint: "tint-10" });
    if (expense > income) out.push({ id: "_short", label: "Faltó (de ahorros o deudas)", value: expense - income, tint: "flow-short" });
    return out;
  });
  const flowRight = $derived.by((): FlowItem[] => {
    const items = byCategory(inRange, "expense").map((c) => ({
      id: c.category || "none",
      label: catName(c.category),
      value: c.total,
      tint: store.category(c.category)?.color || "tint-10",
    }));
    const out = topN(items, income > expense ? 6 : 7, { id: "_rest", label: "Otras categorías", tint: "tint-10" });
    if (income > expense) out.push({ id: "_saved", label: "Te quedó", value: income - expense, tint: "flow-saved" });
    return out;
  });

  const tagOptions = $derived([...new Set([...categoryTags(), ...txs.flatMap((t) => t.tags ?? [])])].sort());

  // Lo que va del periodo, para promediar y para el presupuesto: desde el
  // primer movimiento hasta hoy (ver `periodSpan`).
  const firstDay = $derived(txs.reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null));
  const span = $derived(periodSpan(range, firstDay, now, g));
  const periods = $derived(g === "week" ? span.weeks : g === "month" ? span.months : span.years);
  const per = $derived(g === "week" ? "semana" : g === "month" ? "mes" : "año");

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

  // Con una categoría elegida, las demás porciones se apagan.
  const doughnutConfig = (): ChartConfiguration =>
  ({
    type: "doughnut",
    data: {
      labels: cats.map((c) => store.category(c.category)?.name ?? "Sin categoría"),
      datasets: [
        {
          data: cats.map((c) => c.total),
          backgroundColor: colorsFor(cats.map((c) => store.category(c.category)?.color)).map((col, i) =>
            focus && focus !== (cats[i].category || "none") ? alpha(col, 0.25) : col,
          ),
        },
      ],
    },
    options: {
      cutout: "72%",
      onClick: (_e, els) => {
        const c = els[0] && cats[els[0].index];
        if (!c) return;
        const key = c.category || "none";
        focus = focus === key ? "" : key;
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

  // El ritmo: lo acumulado del periodo contra el anterior entero, como la
  // línea punteada de las apps de finanzas. Por días en un mes y por meses
  // en un año; la vista anual no tiene contra qué.
  const pace = $derived.by(() => {
    if (!prev) return null;
    const n = g === "week" ? Math.max(lastDayOf(ym), lastDayOf(prev.full[0].slice(0, 7))) : 12;
    const slot = (d: string) => (g === "week" ? Number(d.slice(8, 10)) : Number(d.slice(5, 7))) - 1;
    const byKind = (list: Transaction[]) => cumulative(list, catKind, n, slot);
    const current = byKind(inRange.filter((t) => !focus || (t.category || "none") === focus));
    const before = byKind(
      txs.filter(
        (t) =>
          t.date.slice(0, 10) >= prev.full[0] &&
          t.date.slice(0, 10) < prev.full[1] &&
          (!tag || hasTag(t, tag)) &&
          (!focus || (t.category || "none") === focus),
      ),
    );
    // Sin nada antes, la línea punteada sería un cero plano.
    if (!before[n - 1]) return null;
    // Hasta hoy: lo que viene todavía no pasa.
    const upTo = prev.ongoing ? slot(now) : g === "week" ? lastDayOf(ym) - 1 : 11;
    const labels = Array.from({ length: n }, (_, i) => (g === "week" ? String(i + 1) : monthLabel(`${year}-${String(i + 1).padStart(2, "0")}`).split(" ")[0]));
    return { labels, current: current.map((v, i) => (i <= upTo ? v : null)), before, now: current[upTo] ?? 0, then: before[upTo] ?? 0 };
  });

  const paceConfig = (): ChartConfiguration => {
    const color = token(catKind === "income" ? "--viz-income" : "--viz-expense");
    const p = pace!;
    return {
      type: "line",
      data: {
        labels: p.labels,
        datasets: [
          { label: g === "week" ? monthLabel(ym, true) : String(year), data: p.current, borderColor: color, fill: true, pointRadius: 0, tension: 0.25 },
          { label: prev!.short, data: p.before, borderColor: token("--text-muted"), borderDash: [4, 4], pointRadius: 0, tension: 0.25 },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: g === "week" ? 8 : 12, autoSkip: true } },
          y: { min: 0, ticks: { callback: (v) => money(Number(v)), maxTicksLimit: 5 }, border: { display: false } },
        },
        plugins: {
          legend: { display: true, position: "top", align: "end" },
          tooltip: {
            callbacks: {
              title: (items) => (g === "week" ? `Día ${items[0]?.label}` : items[0]?.label),
              label: (c) => (c.raw == null ? "" : ` ${c.dataset.label}: ${money(Number(c.raw))}`),
            },
          },
        },
      },
    } as ChartConfiguration;
  };
  const paceChange = $derived(pace ? change(pace.now, pace.then) : null);

  const focusedCat = $derived(focus ? cats.find((c) => (c.category || "none") === focus) : undefined);

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

<!-- Cuánto cambió contra el periodo anterior; `goodUp` dice si subir es bueno. -->
{#snippet delta(value: number, before: number, goodUp: boolean)}
  {@const c = prev && inPrev.length ? change(value, before) : null}
  {#if c !== null && prev}
    <span
      class="delta"
      class:good={Math.round(c) !== 0 && c > 0 === goodUp}
      class:bad={Math.round(c) !== 0 && c > 0 !== goodUp}
      data-tip="{prev.ongoing ? `A esta altura ${prev.name.replace(/^el /, 'del ')}` : `En ${prev.short}`}: {money(before)}"
    >
      <Icon name={c >= 0 ? "arrow-up-right-01" : "arrow-down-right-01"} />{Math.abs(c) >= 10 ? Math.round(Math.abs(c)) : Math.abs(c).toFixed(1)}%
    </span>
  {/if}
{/snippet}

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
        <MonthPicker bind:value={ym} />
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
        <div class="kpi-head"><span class="kpi-ico tone-income"><Icon name="money-receive-01" /></span><span class="kpi-label">Ingresos</span>{@render delta(income, prevIncome, true)}</div>
        <div class="kpi-val"><Money value={income} tone="income" /></div>
        <div class="kpi-foot">Promedio <Money value={income / periods} /> por {per}</div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-expense"><Icon name="money-send-01" /></span><span class="kpi-label">Gastos</span>{@render delta(expense, prevExpense, false)}</div>
        <div class="kpi-val"><Money value={expense} tone="expense" /></div>
        <div class="kpi-foot">Promedio <Money value={expense / periods} /> por {per}</div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico"><Icon name="coins-01" /></span><span class="kpi-label">Ingresos menos gastos</span></div>
        <div class="kpi-val"><Money value={income - expense} tone="auto" /></div>
        <div class="kpi-foot">{income > 0 ? `Guardaste el ${Math.round(savingRate)}% de lo que entró` : "Sin ingresos en el periodo"}</div>
      </div>
    </div>

    {#if summary.length}
      <section class="card insights" aria-label="En pocas palabras">
        <h3 class="card-title">En pocas palabras</h3>
        <ul>
          {#each summary as item (item.text)}
            <li class="insight {item.tone}">
              <span class="insight-ico"><Icon name={item.icon} size={16} /></span>
              <span>{item.text}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class:split-even={!!pace}>
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
      {#if pace && prev}
        <div class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Ritmo de {catKind === "income" ? "ingresos" : "gastos"}</h3>
              <p class="card-sub">
                {#if paceChange === null}
                  Acumulado contra {prev.short}
                {:else}
                  Vas <Money value={pace.now} />,
                  <b class={Math.round(paceChange) === 0 ? "" : paceChange > 0 === (catKind === "expense") ? "tone-bad" : "tone-good"}>
                    {Math.round(Math.abs(paceChange))}% {paceChange >= 0 ? "más" : "menos"}
                  </b>
                  que {prev.ongoing ? `a esta altura de ${prev.short}` : `en ${prev.short}`}
                {/if}
              </p>
            </div>
          </div>
          <div class="card-body">
            {#if !loading}<Chart config={paceConfig} height={244} label="Acumulado del periodo contra el anterior" />{/if}
          </div>
        </div>
      {/if}
    </div>

    {#if flowLeft.length || flowRight.length}
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">¿A dónde fue tu dinero?</h3>
            <p class="card-sub">De dónde vino lo que entró y en qué se fue. Toca una categoría para verla sola.</p>
          </div>
        </div>
        <div class="card-body">
          <MoneyFlow
            left={flowLeft}
            right={flowRight}
            center={income >= expense ? "Entró" : "Salió"}
            height={400}
            active={focus}
            onpick={(id) => (focus = focus === id ? "" : id)}
          />
        </div>
      </div>
    {/if}

    <!-- A la izquierda el reparto por categoría; a la derecha, por periodo y por etiqueta. -->
    <div class="split-cats">
      <div class="col">
        <div class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Reparto</h3>
              <p class="card-sub">Toca una porción para verla sola en la gráfica</p>
            </div>
          </div>
          <div class="card-body">
            {#if cats.length}
              <div class="donut">
                <Chart config={doughnutConfig} height={340} label="Reparto por categoría" />
                <div class="donut-center" aria-hidden="true">
                  {#if focusedCat}
                    <span class="donut-label">{store.category(focusedCat.category)?.name ?? "Sin categoría"}</span>
                    <b class="donut-total"><Money value={focusedCat.total} /></b>
                    <span class="donut-label">{catTotal ? Math.round((focusedCat.total / catTotal) * 100) : 0}% del total</span>
                  {:else}
                    <span class="donut-label">{catKind === "income" ? "Ingresos" : "Gastos"}</span>
                    <b class="donut-total"><Money value={catTotal} /></b>
                    <span class="donut-label">{cats.length} {cats.length === 1 ? "categoría" : "categorías"}</span>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="empty-card">Nada en este periodo.</div>
            {/if}
          </div>
        </div>
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
                  {@const budget = (cat?.budget ?? 0) * span.budgetMonths}
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
                        <span class="cr-meta">
                          {c.count} {c.count === 1 ? "movimiento" : "movimientos"}
                          {#if prev && inPrev.length}
                            {@const before = prevCats.get(key) ?? 0}
                            {@const d = change(c.total, before)}
                            {#if d === null}
                              · <span class="tone-new">nueva frente a {prev.short}</span>
                            {:else if Math.round(d) !== 0}
                              · <span class={d > 0 === (catKind === "expense") ? "tone-bad" : "tone-good"}>{d > 0 ? "+" : "−"}{Math.round(Math.abs(d))}% vs {prev.short}</span>
                            {/if}
                          {/if}
                        </span>
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
      </div>
      <div class="col">
        <div class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Por {per}</h3>
              <p class="card-sub">Lo que entró y salió en cada periodo</p>
            </div>
          </div>
          <div class="card-body">
            <table class="mini-table">
              <thead><tr><th>Periodo</th><th>Ingresos</th><th>Gastos</th><th>Diferencia</th></tr></thead>
              <tbody>
                {#each bucketize(inRange, g, keys) as b (b.key)}
                  <tr>
                    <td>{label(b.key)}</td>
                    <td><Money value={b.income} /></td>
                    <td><Money value={b.expense} /></td>
                    <td><Money value={b.income - b.expense} tone={b.income || b.expense ? "auto" : undefined} /></td>
                  </tr>
                {/each}
              </tbody>
            </table>
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

  .delta {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-left: auto;
    padding: var(--sp-2) var(--sp-8);
    border-radius: 99rem;
    background: color-mix(in oklab, var(--text-muted) 12%, transparent);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;

    &.good {
      background: color-mix(in oklab, var(--success) 14%, transparent);
      color: var(--success);
    }

    &.bad {
      background: color-mix(in oklab, var(--danger) 14%, transparent);
      color: var(--danger);
    }
  }

  .tone-good {
    color: var(--success);
  }

  .tone-bad {
    color: var(--danger);
  }

  .tone-new {
    color: var(--text-secondary);
  }

  .insights {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    padding: var(--sp-16) var(--sp-20);

    & ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      gap: var(--sp-10) var(--sp-20);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }

  .insight {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-10);
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--text-secondary);

    --tone: var(--text-muted);

    &.good {
      --tone: var(--success);
    }

    /* Lo malo se lee en rojo de una: gastar de más, la categoría que más se lleva. */
    &.bad {
      --tone: var(--danger);

      color: var(--danger);
    }
  }

  .insight-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: 99rem;
    background: color-mix(in oklab, var(--tone) 14%, transparent);
    color: var(--tone);
  }

  .split-cats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--card-gap);

    @media (max-width: 64rem) {
      grid-template-columns: minmax(0, 1fr);
    }

    & > .col {
      display: flex;
      flex-direction: column;
      gap: var(--card-gap);
      min-width: 0;
    }
  }

  .donut {
    position: relative;
    max-width: 22rem;
    margin: var(--sp-8) auto;
  }

  /* El total va en el hueco de la dona, sin estorbar el clic en las porciones. */
  .donut-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: 0 22%;
    text-align: center;
    pointer-events: none;
  }

  .donut-total {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
  }

  .donut-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);

    & th,
    & td {
      padding: var(--sp-6) 0;
      text-align: right;

      &:first-child {
        text-align: left;
      }
    }

    & th {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: var(--border-width) solid var(--border);
    }

    & td {
      color: var(--text-secondary);
      border-bottom: var(--border-width) dashed var(--border);
    }

    & tr:last-child td {
      border-bottom: 0;
    }
  }
</style>
