<!--
  Movimientos: la lista del mes con filtros por cuenta, categoría, tipo,
  etiqueta y texto. Los filtros viven en la URL, así se puede llegar
  filtrado desde otras pantallas (una cuenta, una categoría, "revisar").
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { SvelteSet } from "svelte/reactivity";

  import Money from "../components/app/Money.svelte";
  import PickBar from "../components/app/PickBar.svelte";
  import TransactionList from "../components/app/TransactionList.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Input, Loading, Select } from "../components/ui";
  import Tag, { type Tone } from "../components/ui/Tag.svelte";
  import { alpha, token } from "../lib/colors";
  import { addMonths, dayOf, monthRange, today, ymd } from "../lib/finance";
  import { dateShort, money, monthLabel } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { tintFor } from "../lib/palettes";
  import { pb } from "../lib/pb.svelte";
  import { go, route } from "../lib/router.svelte";
  import { store } from "../lib/store.svelte";
  import { categoryTags, tagsOf } from "../lib/tags";
  import type { Transaction } from "../lib/types";
  import { txModal } from "../lib/ui.svelte";

  const q = route.query;
  let ym = $state(q.get("mes") ?? today().slice(0, 7));
  let all = $state(q.get("mes") === "todo" || (!!q.get("tag") && !q.get("mes")));
  let account = $state(q.get("cuenta") ?? "");
  let category = $state(q.get("cat") ?? "");
  let type = $state(q.get("tipo") ?? "");
  let tag = $state(q.get("tag") ?? "");
  let search = $state("");

  let items = $state<Transaction[]>([]);
  let loading = $state(true);

  $effect(() => {
    void store.txVersion;
    const parts: string[] = [];
    const params: Record<string, string> = {};
    if (!all) {
      const [a, b] = monthRange(ym);
      parts.push("date >= {:a} && date < {:b}");
      params.a = a;
      params.b = b;
    }
    if (account) {
      parts.push("(account = {:acc} || to_account = {:acc})");
      params.acc = account;
    }
    if (category) {
      parts.push(category === "none" ? "category = ''" : "category = {:cat}");
      params.cat = category;
    }
    if (type) {
      parts.push("type = {:type}");
      params.type = type;
    }
    if (tag) {
      // La etiqueta puede venir del movimiento o de su categoría.
      parts.push("(tags ~ {:tag} || category.tags ~ {:tag})");
      params.tag = `"${tag}"`;
    }
    loading = true;
    pb.collection("transactions")
      .getFullList<Transaction>({ filter: pb.filter(parts.join(" && "), params), sort: "-date,-created", batch: 500 })
      .then((r) => (items = r))
      .catch(notify.fail)
      .finally(() => (loading = false));
  });

  const shown = $derived.by(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((t) =>
      [t.description, t.notes, store.category(t.category)?.name, ...tagsOf(t)].some((x) => x?.toLowerCase().includes(s)),
    );
  });

  const income = $derived(shown.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
  const expense = $derived(shown.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
  // Lo marcado para sumar. Solo cuenta lo que está a la vista: si un filtro
  // esconde un movimiento marcado, sale de la suma sin perder la marca.
  const selected = new SvelteSet<string>();
  const picked = $derived(shown.filter((t) => selected.has(t.id)));
  const sumOf = (kind: string) => picked.filter((t) => t.type === kind).reduce((s, t) => s + t.amount, 0);
  const pickedIncome = $derived(sumOf("income"));
  const pickedExpense = $derived(sumOf("expense"));
  const pickedTransfer = $derived(sumOf("transfer"));

  const tags = $derived([...new Set([...categoryTags(), ...items.flatMap((t) => t.tags ?? [])])].sort());
  const filtered = $derived(!!(account || category || type || tag || search));

  // Ampliado (por días, con etiquetas y notas) o compacto (tabla). Se
  // recuerda en este navegador.
  const VIEW_KEY = "finanzas-movimientos-vista";
  let compact = $state(readCompact());
  function readCompact() {
    try {
      return localStorage.getItem(VIEW_KEY) !== "ampliado";
    } catch {
      return true;
    }
  }
  function setCompact(on: boolean) {
    compact = on;
    try {
      localStorage.setItem(VIEW_KEY, on ? "compacto" : "ampliado");
    } catch {
      // Sin almacenamiento, vale para esta visita.
    }
  }

  // La gráfica de abajo: lo marcado con clic derecho o, si no hay nada
  // marcado, todo lo que está a la vista. Abierta o cerrada se recuerda.
  const CHART_KEY = "finanzas-movimientos-grafica";
  let chartOn = $state(readChart());
  function readChart() {
    try {
      return localStorage.getItem(CHART_KEY) === "1";
    } catch {
      return false;
    }
  }
  function setChart(on: boolean) {
    chartOn = on;
    try {
      localStorage.setItem(CHART_KEY, on ? "1" : "0");
    } catch {
      // Sin almacenamiento, vale para esta visita.
    }
  }

  const charted = $derived(picked.length ? picked : shown);

  /**
   * Las sumas por día si lo graficado cabe en unos dos meses; si no, por
   * mes. Los días o meses sin movimientos van en cero para que la línea no
   * salte huecos.
   */
  const series = $derived.by(() => {
    const dates = charted.map((t) => dayOf(t.date)).sort();
    if (!dates.length) return { daily: true, keys: [] as string[], rows: new Map<string, Record<string, number>>() };
    const [first, last] = [dates[0], dates[dates.length - 1]];
    const span = (Date.parse(last) - Date.parse(first)) / 864e5;
    const daily = span <= 62;
    const keys: string[] = [];
    if (daily) {
      const [y, m, d] = first.split("-").map(Number);
      for (let i = 0; i <= span; i++) keys.push(ymd(new Date(y, m - 1, d + i)));
    } else {
      for (let k = first.slice(0, 7); k <= last.slice(0, 7); k = addMonths(k, 1)) keys.push(k);
    }
    const rows = new Map(keys.map((k) => [k, { income: 0, expense: 0, transfer: 0 } as Record<string, number>]));
    for (const t of charted) {
      const row = rows.get(daily ? dayOf(t.date) : t.date.slice(0, 7));
      if (row) row[t.type] += t.amount;
    }
    return { daily, keys, rows };
  });

  const chartConfig = (): ChartConfiguration => {
    const { daily, keys, rows } = series;
    const kinds = [
      { kind: "income", label: "Ingresos", color: token("--viz-income") },
      { kind: "expense", label: "Gastos", color: token("--viz-expense") },
      { kind: "transfer", label: "Transferencias", color: token("--transfer") },
    ].filter(({ kind }) => charted.some((t) => t.type === kind));
    return {
      type: "line",
      data: {
        labels: keys.map((k) => (daily ? dateShort(k) : monthLabel(k))),
        datasets: kinds.map(({ kind, label, color }) => ({
          label,
          data: keys.map((k) => rows.get(k)?.[kind] ?? 0),
          borderColor: color,
          backgroundColor: alpha(color, 0.08),
          fill: kinds.length === 1,
          borderWidth: 2,
          pointRadius: keys.length > 40 ? 0 : 2.5,
          tension: 0.3,
        })),
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
          y: { beginAtZero: true, ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
        },
        plugins: {
          legend: { position: "top", align: "end" },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
        },
      },
    };
  };

  function clear() {
    account = category = type = tag = search = "";
    go("/movimientos");
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Movimientos</h1>
      <p>{all ? "Todo el historial" : monthLabel(ym, true)} · {shown.length} {shown.length === 1 ? "movimiento" : "movimientos"}</p>
    </div>
    <div class="page-actions">
      <div class="month-nav">
        <button type="button" class="btn-icon sm" aria-label="Mes anterior" disabled={all} onclick={() => (ym = addMonths(ym, -1))}>
          <Icon name="arrow-left-01" />
        </button>
        <input type="month" class="field-control sm" bind:value={ym} disabled={all} />
        <button type="button" class="btn-icon sm" aria-label="Mes siguiente" disabled={all} onclick={() => (ym = addMonths(ym, 1))}>
          <Icon name="arrow-right-01" />
        </button>
        <Tag tone={all ? "tint-1" : "off"} onclick={() => (all = !all)} pressed={all}>Todo</Tag>
      </div>
      <Button variant="secondary" onclick={() => txModal.new({ account: account || undefined })}><Icon name="add-01" />Agregar</Button>
    </div>
  </header>

  <div class="filters card">
    <div class="filters-grid">
      <Input bind:value={search} placeholder="Buscar…" />
      <Select bind:value={account}>
        <option value="">Todas las cuentas</option>
        {#each store.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </Select>
      <Select bind:value={category}>
        <option value="">Todas las categorías</option>
        <option value="none">Sin categoría</option>
        <optgroup label="Gastos">
          {#each store.categories.filter((c) => c.kind === "expense") as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </optgroup>
        <optgroup label="Ingresos">
          {#each store.categories.filter((c) => c.kind === "income") as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </optgroup>
      </Select>
      <Select bind:value={type}>
        <option value="">Todos los tipos</option>
        <option value="expense">Gastos</option>
        <option value="income">Ingresos</option>
        <option value="transfer">Transferencias</option>
      </Select>
    </div>
    {#if tags.length || tag}
      <div class="filters-tags">
        {#each [...new Set([tag, ...tags].filter(Boolean))] as t (t)}
          <Tag
            tone={tag === t ? ((t === "revisar" ? "tag-warning" : tintFor(t)) as Tone) : "off"}
            pressed={tag === t}
            onclick={() => (tag = tag === t ? "" : t)}>#{t}</Tag
          >
        {/each}
      </div>
    {/if}
    <div class="filters-foot">
      <span>Ingresos <Money value={income} tone="income" /></span>
      <span>Gastos <Money value={expense} tone="expense" /></span>
      <span>Ingresos menos gastos <Money value={income - expense} tone="auto" /></span>
      <span class="pick-hint small"><Icon name="mouse-right-click-01" size={14} />Clic derecho en un movimiento para sumarlo</span>
      {#if filtered}<button type="button" class="link small" onclick={clear}>Quitar filtros</button>{/if}
    </div>
  </div>

  <div class="list-bar">
    <button type="button" class="chip chart-toggle" class:active={chartOn} aria-pressed={chartOn} onclick={() => setChart(!chartOn)}>
      <Icon name="chart-line-data-01" size={14} />Gráfica
    </button>
    <div class="chips view-tabs" role="tablist" aria-label="Vista de la lista">
      <button type="button" role="tab" class="chip" class:active={!compact} aria-selected={!compact} onclick={() => setCompact(false)}>Ampliado</button>
      <button type="button" role="tab" class="chip" class:active={compact} aria-selected={compact} onclick={() => setCompact(true)}>Compacto</button>
    </div>
  </div>

  {#if loading && !items.length}
    <Loading />
  {:else if shown.length}
    <TransactionList items={shown} onOpen={(t) => txModal.edit(t)} showAccount={!account} {compact} {selected} />
  {:else}
    <div class="card empty-card">
      No hay movimientos {filtered ? "con esos filtros" : "este mes"}.
    </div>
  {/if}
  {#if chartOn && charted.length}
    <div class="card tx-chart">
      <div class="card-head">
        <div>
          <h3 class="card-title">{picked.length ? "Lo seleccionado" : filtered ? "Lo buscado" : "Movimientos"} en el tiempo</h3>
          <p class="card-sub">
            {charted.length} {charted.length === 1 ? "movimiento" : "movimientos"} · por {series.daily ? "día" : "mes"}
            {#if !picked.length} · clic derecho en la lista para graficar solo algunos{/if}
          </p>
        </div>
        <div class="card-head-actions">
          <button type="button" class="btn-icon sm" aria-label="Cerrar gráfica" onclick={() => setChart(false)}><Icon name="cancel-01" /></button>
        </div>
      </div>
      <div class="card-body">
        <Chart config={chartConfig} height={260} label="Movimientos en el tiempo" />
      </div>
    </div>
  {/if}
  {#if picked.length}
    <PickBar
      count={picked.length}
      onAll={picked.length < shown.length ? () => shown.forEach((t) => selected.add(t.id)) : undefined}
      onClear={() => selected.clear()}
    >
      {#snippet actions()}
        <button type="button" class="pick-extra" aria-pressed={chartOn} data-tip="Ver lo seleccionado en la gráfica" onclick={() => setChart(!chartOn)}>
          <Icon name="chart-line-data-01" size={14} />Gráfica
        </button>
      {/snippet}
      {#if pickedIncome}<span>Ingresos <Money value={pickedIncome} tone="income" /></span>{/if}
      {#if pickedExpense}<span>Gastos <Money value={pickedExpense} tone="expense" /></span>{/if}
      {#if pickedTransfer}<span>Transferencias <Money value={pickedTransfer} tone="transfer" /></span>{/if}
      {#if pickedIncome && pickedExpense}<span>Ingresos menos gastos <Money value={pickedIncome - pickedExpense} tone="auto" /></span>{/if}
    </PickBar>
  {/if}
</div>


<style>
  .pick-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: auto;
    color: var(--text-subtle);

    @media (max-width: 56rem) {
      display: none;
    }

    @media (min-width: 56.01rem) {
      & ~ .link {
        margin-left: 0;
      }
    }
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: var(--sp-4);

    & input {
      width: 10rem;
    }
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    margin-bottom: var(--sp-20);
    padding: var(--sp-14);
  }

  .filters-grid {
    display: grid;
    grid-template-columns: 1.3fr repeat(3, 1fr);
    gap: var(--sp-8);

    @media (max-width: 48rem) {
      grid-template-columns: 1fr 1fr;
    }
  }

  .filters-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
  }

  .list-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    margin-bottom: var(--sp-12);
  }

  .chart-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .tx-chart {
    margin-top: var(--sp-20);
  }

  .filters-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8) var(--sp-20);
    font-size: var(--text-sm);
    color: var(--text-muted);

    & :global(.money) {
      margin-left: 0.25rem;
      font-weight: 600;
    }

    & .link {
      margin-left: auto;
    }
  }
</style>
