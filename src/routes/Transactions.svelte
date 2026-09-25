<!--
  Movimientos: la lista del mes con filtros por cuenta, categoría, tipo,
  etiqueta y texto. Los filtros viven en la URL, así se puede llegar
  filtrado desde otras pantallas (una cuenta, una categoría, "revisar").
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import Money from "../components/app/Money.svelte";
  import PickBar from "../components/app/PickBar.svelte";
  import DupeCard from "../components/app/DupeCard.svelte";
  import TransactionList from "../components/app/TransactionList.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Input, Loading, MonthPicker, Select } from "../components/ui";
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
  import { keys } from "../lib/keys";
  import { txModal } from "../lib/ui.svelte";

  const q = route.query;
  // "mes" es un mes (aaaa-mm) o "todo"; lo demás, el mes de hoy.
  const MONTH = /^\d{4}-\d{2}$/;
  const mes = q.get("mes") ?? "";
  let ym = $state(MONTH.test(mes) ? mes : today().slice(0, 7));
  let all = $state(
    q.get("mes") === "todo" || (!!q.get("tag") && !q.get("mes")),
  );
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
    // Al cambiar rápido de mes o de filtro, solo vale la respuesta del último.
    let alive = true;
    loading = true;
    pb.collection("transactions")
      .getFullList<Transaction>({
        filter: pb.filter(parts.join(" && "), params),
        sort: "-date,-created",
        batch: 500,
        expand: "rule,dup_of",
      })
      .then((r) => alive && (items = r))
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  const shown = $derived.by(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((t) =>
      [
        t.description,
        t.notes,
        store.category(t.category)?.name,
        ...tagsOf(t),
      ].some((x) => x?.toLowerCase().includes(s)),
    );
  });

  const income = $derived(
    shown.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
  );
  const expense = $derived(
    shown.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
  );
  // Lo marcado para sumar. Solo cuenta lo que está a la vista: si un filtro
  // esconde un movimiento marcado, sale de la suma sin perder la marca.
  const selected = new SvelteSet<string>();
  const picked = $derived(shown.filter((t) => selected.has(t.id)));
  const sumOf = (kind: string) =>
    picked.filter((t) => t.type === kind).reduce((s, t) => s + t.amount, 0);
  const pickedIncome = $derived(sumOf("income"));
  const pickedExpense = $derived(sumOf("expense"));
  const pickedTransfer = $derived(sumOf("transfer"));

  // Las etiquetas, en dos grupos: las que se ponen en las categorías (y
  // heredan sus movimientos) y las puestas a mano en un movimiento. Una que
  // esté en los dos lados va con las de categoría.
  const catTagList = $derived(categoryTags());
  const txTagList = $derived.by(() => {
    const inCats = new Set(catTagList);
    const own = new Set(items.flatMap((t) => t.tags ?? []));
    if (tag && !inCats.has(tag)) own.add(tag);
    return [...own].filter((t) => !inCats.has(t)).sort();
  });
  const types: [string, string, Tone][] = [
    ["expense", "Gastos", "tag-error"],
    ["income", "Ingresos", "tag-success"],
    ["transfer", "Transferencias", "tint-10"],
  ];

  const filterCount = $derived([account, category, type, tag, search.trim()].filter(Boolean).length);
  const filtered = $derived(filterCount > 0);

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

  // La gráfica de abajo, siempre: lo marcado con clic derecho o, si no hay
  // nada marcado, todo lo que está a la vista.
  let chartBox = $state<HTMLElement | null>(null);

  // Va debajo de la lista: desde lo seleccionado se lleva la vista hasta ella.
  async function showChart() {
    await tick();
    chartBox?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const charted = $derived(picked.length ? picked : shown);

  /**
   * Las sumas por día si lo graficado cabe en unos dos meses; si no, por
   * mes. Los días o meses sin movimientos van en cero para que la línea no
   * salte huecos.
   */
  const series = $derived.by(() => {
    const dates = charted.map((t) => dayOf(t.date)).sort();
    if (!dates.length)
      return {
        daily: true,
        keys: [] as string[],
        rows: new Map<string, Record<string, number>>(),
      };
    const [first, last] = [dates[0], dates[dates.length - 1]];
    const span = (Date.parse(last) - Date.parse(first)) / 864e5;
    const daily = span <= 62;
    const keys: string[] = [];
    if (daily) {
      const [y, m, d] = first.split("-").map(Number);
      for (let i = 0; i <= span; i++) keys.push(ymd(new Date(y, m - 1, d + i)));
    } else {
      for (
        let k = first.slice(0, 7);
        k <= last.slice(0, 7);
        k = addMonths(k, 1)
      )
        keys.push(k);
    }
    const rows = new Map(
      keys.map((k) => [
        k,
        { income: 0, expense: 0, transfer: 0 } as Record<string, number>,
      ]),
    );
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
          x: {
            grid: { display: false },
            ticks: { maxRotation: 0, autoSkipPadding: 12 },
          },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => money(Number(v)) },
            border: { display: false },
          },
        },
        plugins: {
          legend: { position: "top", align: "end" },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}`,
            },
          },
        },
      },
    };
  };

  let searchBox = $state<HTMLDivElement>();

  // Con algo marcado para sumar, las flechas no cambian de mes: se perdería
  // de vista lo marcado.
  const onKey = keys({
    ArrowLeft: () => !all && !selected.size && (ym = addMonths(ym, -1)),
    ArrowRight: () => !all && !selected.size && (ym = addMonths(ym, 1)),
    h: () => {
      all = false;
      ym = today().slice(0, 7);
    },
    t: () => (all = !all),
    g: () => showChart(),
    v: () => setCompact(!compact),
    "/": () => searchBox?.querySelector("input")?.focus(),
  });

  function clear() {
    account = category = type = tag = search = "";
    all = false;
    ym = today().slice(0, 7);
    go("/movimientos");
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
  <header class="page-head">
    <div>
      <h1>Movimientos</h1>
      <p>
        {all ? "Todo el historial" : monthLabel(ym, true)} · {shown.length}
        {shown.length === 1 ? "movimiento" : "movimientos"}
      </p>
    </div>
    <div class="page-actions">
      <div class="month-nav">
        <button
          type="button"
          class="btn-icon sm"
          aria-label="Mes anterior"
          data-tip="Mes anterior (←)"
          disabled={all}
          onclick={() => (ym = addMonths(ym, -1))}
        >
          <Icon name="arrow-left-01" />
        </button>
        <MonthPicker bind:value={ym} disabled={all} />
        <button
          type="button"
          class="btn-icon sm"
          aria-label="Mes siguiente"
          data-tip="Mes siguiente (→)"
          disabled={all}
          onclick={() => (ym = addMonths(ym, 1))}
        >
          <Icon name="arrow-right-01" />
        </button>
        <Tag
          class="month-all"
          tone={all ? "tint-1" : "off"}
          onclick={() => (all = !all)}
          pressed={all}>Todo</Tag
        >
      </div>
    </div>
  </header>

  <div class="filters card" class:is-filtered={filtered}>
    <div class="filters-grid">
      <div bind:this={searchBox}>
        <Input bind:value={search} class={search.trim() ? "is-on" : ""} placeholder="Buscar… ( / )" />
      </div>
      <Select bind:value={account} class={account ? "is-on" : ""}>
        <option value="">Todas las cuentas</option>
        {#each store.accounts as a (a.id)}<option value={a.id}>{a.name}</option
          >{/each}
      </Select>
      <Select bind:value={category} class={category ? "is-on" : ""}>
        <option value="">Todas las categorías</option>
        <option value="none">Sin categoría</option>
        <optgroup label="Gastos">
          {#each store.categories.filter((c) => c.kind === "expense") as c (c.id)}<option
              value={c.id}>{c.name}</option
            >{/each}
        </optgroup>
        <optgroup label="Ingresos">
          {#each store.categories.filter((c) => c.kind === "income") as c (c.id)}<option
              value={c.id}>{c.name}</option
            >{/each}
        </optgroup>
      </Select>
    </div>
    <div class="filters-tags">
      <div class="filters-group">
        <span class="filters-label">Tipo</span>
        <div class="filters-chips">
          <!-- El tipo: uno a la vez; tocar el elegido lo quita. -->
          {#each types as [value, label, tone] (value)}
            <Tag
              tone={type === value ? tone : "off"}
              pressed={type === value}
              onclick={() => (type = type === value ? "" : value)}>{label}</Tag
            >
          {/each}
        </div>
      </div>
      {#snippet tagGroup(label: string, list: string[])}
        <span class="filters-sep" aria-hidden="true"></span>
        <div class="filters-group">
          <span class="filters-label">{label}</span>
          <div class="filters-chips">
            {#each list as t (t)}
              <Tag
                tone={tag === t
                  ? ((t === "revisar" ? "tag-warning" : tintFor(t)) as Tone)
                  : "off"}
                pressed={tag === t}
                onclick={() => (tag = tag === t ? "" : t)}>#{t}</Tag
              >
            {/each}
          </div>
        </div>
      {/snippet}
      {#if catTagList.length}{@render tagGroup("Etiquetas de categorías", catTagList)}{/if}
      {#if txTagList.length}{@render tagGroup("Etiquetas de movimientos", txTagList)}{/if}
    </div>
    <div class="filters-foot">
      <span>Ingresos <Money value={income} tone="income" /></span>
      <span>Gastos <Money value={expense} tone="expense" /></span>
      <!-- Con filtros el neto confunde: solo se ve una parte de los movimientos. -->
      {#if !filtered}<span
          >Ingresos menos gastos <Money
            value={income - expense}
            tone="auto"
          /></span
        >{/if}
      <span class="pick-hint small"
        ><Icon name="mouse-right-click-01" size={14} />Clic derecho en un
        movimiento para sumarlo</span
      >
      {#if filtered}<button type="button" class="filters-clear" onclick={clear}
          ><Icon name="filter-remove" size={14} />Quitar {filterCount === 1 ? "filtro" : `${filterCount} filtros`}</button
        >{/if}
    </div>
  </div>

  <div class="list-bar">
    <div class="chips view-tabs" role="tablist" aria-label="Vista de la lista">
      <button
        type="button"
        role="tab"
        class="chip"
        class:active={!compact}
        aria-selected={!compact}
        onclick={() => setCompact(false)}>Ampliado</button
      >
      <button
        type="button"
        role="tab"
        class="chip"
        class:active={compact}
        aria-selected={compact}
        onclick={() => setCompact(true)}>Compacto</button
      >
    </div>
  </div>

  <!-- Posibles repetidos (ver pb_hooks/lib/dupes.js): la persona decide. -->
  {#each items.filter((t) => t.dup_of && t.expand?.dup_of) as t (t.id)}
    <DupeCard tx={t} twin={t.expand!.dup_of!} />
  {/each}

  {#if loading && !items.length}
    <Loading />
  {:else if shown.length}
    <TransactionList
      items={shown}
      onOpen={(t) => txModal.edit(t)}
      showAccount={!account}
      {compact}
      {selected}
    />
  {:else}
    <div class="card empty-card">
      No hay movimientos {filtered ? "con esos filtros" : "este mes"}.
    </div>
  {/if}
  {#if charted.length}
    <div class="card tx-chart" bind:this={chartBox}>
      <div class="card-head">
        <div>
          <h3 class="card-title">
            {picked.length
              ? "Lo seleccionado"
              : filtered
                ? "Lo buscado"
                : "Movimientos"} en el tiempo
          </h3>
          <p class="card-sub">
            {charted.length}
            {charted.length === 1 ? "movimiento" : "movimientos"} · por {series.daily
              ? "día"
              : "mes"}
            {#if !picked.length}
              · clic derecho en la lista para graficar solo algunos{/if}
          </p>
        </div>
      </div>
      <div class="card-body">
        <Chart
          config={chartConfig}
          height={260}
          label="Movimientos en el tiempo"
        />
      </div>
    </div>
  {/if}
  {#if picked.length}
    <PickBar
      count={picked.length}
      onAll={picked.length < shown.length
        ? () => shown.forEach((t) => selected.add(t.id))
        : undefined}
      onClear={() => selected.clear()}
    >
      {#snippet actions()}
        <button
          type="button"
          class="pick-extra"
          data-tip="Ver lo seleccionado en la gráfica"
          onclick={showChart}
        >
          <Icon name="chart-line-data-01" size={14} />Gráfica
        </button>
      {/snippet}
      {#if pickedIncome}<span
          >Ingresos <Money value={pickedIncome} tone="income" /></span
        >{/if}
      {#if pickedExpense}<span
          >Gastos <Money value={pickedExpense} tone="expense" /></span
        >{/if}
      {#if pickedTransfer}<span
          >Transferencias <Money value={pickedTransfer} tone="transfer" /></span
        >{/if}
      {#if pickedIncome && pickedExpense}<span
          >Ingresos menos gastos <Money
            value={pickedIncome - pickedExpense}
            tone="auto"
          /></span
        >{/if}
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
      & ~ .filters-clear {
        margin-left: 0;
      }
    }
  }

  .month-nav {
    display: flex;
    align-items: center;
    gap: var(--sp-4);

    /* "Todo" del alto del selector de mes, un poco aparte de las flechas. */
    & :global(.month-all) {
      height: 34px;
      margin-left: var(--sp-8);
      padding-inline: var(--sp-14);
    }
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    margin-bottom: var(--sp-20);
    padding: var(--sp-14);
  }

  /* Con filtros puestos, que se note: la tarjeta y cada control encendido. */
  .filters.is-filtered {
    --on-blue: light-dark(oklch(0.55 0.22 258), oklch(0.7 0.2 255));
    box-shadow: inset 0 0 0 1px var(--on-blue);

    & :global(.field-control.is-on) {
      border-color: var(--on-blue);
      background: color-mix(in oklab, var(--on-blue) 16%, var(--bg-field));
      box-shadow: 0 0 0 1px var(--on-blue);
    }
  }

  .filters-clear {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: var(--sp-4) var(--sp-12);
    border: 0;
    border-radius: 999px;
    background: var(--on-blue);
    color: light-dark(oklch(0.99 0 0), oklch(0.18 0.04 255));
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;

    &:hover {
      filter: brightness(1.1);
    }
  }

  .filters-grid {
    display: grid;
    grid-template-columns: 1.3fr repeat(2, 1fr);
    gap: var(--sp-8);

    @media (max-width: 48rem) {
      grid-template-columns: 1fr 1fr;
    }
  }

  .filters-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--sp-10) var(--sp-12);
  }

  .filters-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .filters-label {
    font-size: 0.625rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .filters-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
  }

  /* Entre un grupo y el siguiente, del alto de las etiquetas. */
  .filters-sep {
    align-self: flex-end;
    width: var(--border-width);
    height: 1.625rem;
    background: var(--border);
  }

  .list-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-8);
    margin-bottom: var(--sp-12);
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

    & .filters-clear {
      margin-left: auto;
    }
  }
</style>
