<!--
  Movimientos: la lista del mes con filtros por cuenta, categoría, tipo,
  etiqueta y texto (o monto). Los filtros viven en la URL, así se puede llegar
  filtrado desde otras pantallas (una cuenta, una categoría, "revisar").

  Como en el celular, lo filtrado se ve de cuatro maneras: lista, calendario
  (el mes), mensual (el año mes a mes) y total (presupuesto y cuentas).
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import Money from "../components/app/Money.svelte";
  import PickBar from "../components/app/PickBar.svelte";
  import DupeCard from "../components/app/DupeCard.svelte";
  import TransactionList from "../components/app/TransactionList.svelte";
  import CalendarView from "../components/mobile/CalendarView.svelte";
  import MonthlyView from "../components/mobile/MonthlyView.svelte";
  import TotalView from "../components/mobile/TotalView.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Input, Loading, Select } from "../components/ui";
  import PeriodPicker, { type Period } from "../components/ui/PeriodPicker.svelte";
  import Tag, { type Tone } from "../components/ui/Tag.svelte";
  import { alpha, token } from "../lib/colors";
  import { addMonths, dayOf, monthRange, today, ymd } from "../lib/finance";
  import { dateLong, dateShort, dateYmd, money, monthLabel, monthYm } from "../lib/format";
  import { matches } from "../lib/mobile";
  import { notify } from "../lib/notify.svelte";
  import { tintFor } from "../lib/palettes";
  import { pb } from "../lib/pb.svelte";
  import { go, route } from "../lib/router.svelte";
  import { store } from "../lib/store.svelte";
  import { categoryTags } from "../lib/tags";
  import type { Transaction } from "../lib/types";
  import { keys } from "../lib/keys";
  import { txModal } from "../lib/ui.svelte";

  const q = route.query;
  // El periodo: "mes" es un mes (aaaa-mm) o "todo"; "año", un año;
  // "desde" y "hasta", un rango de días. Sin nada, el mes de hoy (y con una
  // etiqueta, todo el historial).
  const MONTH = /^\d{4}-\d{2}$/;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  function fromQuery(): Period {
    const mes = q.get("mes") ?? "";
    const año = q.get("año") ?? "";
    const [desde, hasta] = [q.get("desde") ?? "", q.get("hasta") ?? ""];
    if (DAY.test(desde) && DAY.test(hasta)) return { kind: "rango", from: desde, to: hasta };
    if (/^\d{4}$/.test(año)) return { kind: "año", y: año };
    if (MONTH.test(mes)) return { kind: "mes", ym: mes };
    if (mes === "todo" || (q.get("tag") && !mes)) return { kind: "todo" };
    return { kind: "mes", ym: today().slice(0, 7) };
  }
  let period = $state<Period>(fromQuery());
  const all = $derived(period.kind === "todo");
  const thisMonth = (): Period => ({ kind: "mes", ym: today().slice(0, 7) });

  /** Del primer día del periodo al día siguiente al último; null si es todo. */
  function bounds(p: Period): [string, string] | null {
    if (p.kind === "mes") return monthRange(p.ym);
    if (p.kind === "año") return [`${p.y}-01-01`, `${Number(p.y) + 1}-01-01`];
    if (p.kind === "rango") {
      const [y, m, d] = p.to.split("-").map(Number);
      return [p.from, ymd(new Date(y, m - 1, d + 1))];
    }
    return null;
  }

  /** El mes o el año anterior (-1) o siguiente (1); un rango o todo no se mueven. */
  function shift(n: number) {
    if (period.kind === "mes") period = { kind: "mes", ym: addMonths(period.ym, n) };
    else if (period.kind === "año") period = { kind: "año", y: String(Number(period.y) + n) };
  }

  const periodText = $derived(
    period.kind === "mes"
      ? monthYm(period.ym)
      : period.kind === "año"
        ? `Año ${period.y}`
        : period.kind === "rango"
          ? `Del ${dateYmd(period.from)} al ${dateYmd(period.to)}`
          : "Todo el historial",
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
    const range = bounds(period);
    if (range) {
      const [a, b] = range;
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

  const shown = $derived(search.trim() ? items.filter((t) => matches(t, search)) : items);

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

  // Lo que se ve: la lista, o como en el celular el calendario del mes, el
  // año mes a mes o el total del mes. Cada una pide su periodo: elegirla lo
  // pone, y si luego se cambia a otro que no le sirve, se ve la lista.
  type View = "lista" | "calendario" | "mensual" | "total";
  const VIEWS: { id: View; label: string }[] = [
    { id: "lista", label: "Lista" },
    { id: "calendario", label: "Calendario" },
    { id: "mensual", label: "Mensual" },
    { id: "total", label: "Total" },
  ];
  let view = $state<View>("lista");
  const fits = (v: View, p: Period) =>
    v === "lista" || (v === "mensual" ? p.kind === "año" : p.kind === "mes");
  const shownView = $derived(fits(view, period) ? view : "lista");

  /** El mes de referencia del periodo: el que se ve o el más cercano a hoy. */
  const refYm = $derived.by(() => {
    const now = today().slice(0, 7);
    if (period.kind === "mes") return period.ym;
    if (period.kind === "año") return now.startsWith(period.y) ? now : `${period.y}-12`;
    if (period.kind === "rango") return period.to.slice(0, 7);
    return now;
  });

  function setView(v: View) {
    if (!fits(v, period))
      period = v === "mensual" ? { kind: "año", y: refYm.slice(0, 4) } : { kind: "mes", ym: refYm };
    view = v;
  }

  // El día tocado en el calendario: sus movimientos, debajo.
  let day = $state("");
  const dayItems = $derived(day ? shown.filter((t) => dayOf(t.date) === day) : []);
  $effect(() => {
    void period;
    day = "";
  });

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
    ArrowLeft: () => !selected.size && shift(-1),
    ArrowRight: () => !selected.size && shift(1),
    h: () => (period = thisMonth()),
    t: () => (period = all ? thisMonth() : { kind: "todo" }),
    g: () => showChart(),
    v: () => setCompact(!compact),
    "/": () => searchBox?.querySelector("input")?.focus(),
    "mod+a": () => shown.forEach((t) => selected.add(t.id)),
  });

  function clear() {
    account = category = type = tag = search = "";
    period = thisMonth();
    go("/movimientos");
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
  <header class="page-head">
    <div>
      <h1>Movimientos</h1>
      <p>
        {periodText} · {shown.length}
        {shown.length === 1 ? "movimiento" : "movimientos"}
      </p>
    </div>
    <div class="page-actions">
      <PeriodPicker bind:value={period} />
    </div>
  </header>

  <div class="filters card" class:is-filtered={filtered}>
    <div class="filters-grid">
      <div bind:this={searchBox}>
        <Input bind:value={search} class={search.trim() ? "is-on" : ""} placeholder="Buscar texto o monto… ( / )" />
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
    <div class="chips view-tabs" role="tablist" aria-label="Vista">
      {#each VIEWS as v (v.id)}
        <button
          type="button"
          role="tab"
          class="chip"
          class:active={shownView === v.id}
          aria-selected={shownView === v.id}
          onclick={() => setView(v.id)}>{v.label}</button
        >
      {/each}
    </div>
    {#if shownView === "lista" || day}
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
    {/if}
  </div>

  <!-- Posibles repetidos (ver pb_hooks/lib/dupes.js): la persona decide. -->
  {#each items.filter((t) => t.dup_of && t.expand?.dup_of) as t (t.id)}
    <DupeCard tx={t} twin={t.expand!.dup_of!} />
  {/each}

  {#if loading && !items.length}
    <Loading />
  {:else if shownView === "calendario"}
    <div class="tx-view">
      <CalendarView ym={refYm} txs={shown} picked={day} onPick={(d) => (day = day === d ? "" : d)} />
      {#if day}
        <div class="day-head">
          <h3 class="card-title">{dateLong(day)}</h3>
          <button type="button" class="btn sm" onclick={() => txModal.new({ type: "expense", date: day })}
            ><Icon name="add-01" size={14} />Anotar</button
          >
        </div>
        {#if dayItems.length}
          <TransactionList items={dayItems} onOpen={(t) => txModal.edit(t)} showAccount={!account} {compact} {selected} />
        {:else}
          <div class="card empty-card">Sin movimientos este día.</div>
        {/if}
      {/if}
    </div>
  {:else if shownView === "mensual"}
    <div class="tx-view">
      <MonthlyView
        ym={refYm}
        txs={shown}
        onPick={(m) => {
          period = { kind: "mes", ym: m };
          view = "lista";
        }}
      />
    </div>
  {:else if shownView === "total"}
    <div class="tx-view">
      <TotalView ym={refYm} txs={shown} />
    </div>
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    margin-bottom: var(--sp-12);
  }

  /* Las vistas del celular, a lo ancho de la página. */
  .tx-view {
    & :global(.card) {
      margin-inline: 0;
    }

    & :global(.cal-d) {
      min-height: 6.5rem;
      padding: var(--sp-6) var(--sp-8);
      gap: var(--sp-4);
    }

    & :global(.cal-n),
    & :global(.cal-v) {
      font-size: var(--text-sm);
    }

    & :global(.mo-row),
    & :global(.mo-week) {
      grid-template-columns: minmax(0, 1fr) 10rem 10rem;
    }

    & :global(.t-block) {
      margin-bottom: var(--sp-20);
    }
  }

  .day-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    margin-bottom: var(--sp-12);

    & h3 {
      margin: 0;

      &::first-letter {
        text-transform: uppercase;
      }
    }
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
