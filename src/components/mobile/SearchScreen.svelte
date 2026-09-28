<!--
  El buscador del celular, a pantalla completa: arriba solo la caja de texto;
  el botón de la derecha despliega los filtros --periodo, tipo, cuenta,
  categoría y etiqueta-- que se combinan entre sí. Los filtros puestos se
  ven como fichas bajo la caja y cada una se quita con su ×.

  Los filtros viven en quien lo abre (`filters`), así al volver se conservan.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import DayList from "./DayList.svelte";
  import TopBar from "./TopBar.svelte";
  import { Calendar } from "../ui";
  import { TX_TYPES } from "../../lib/labels";
  import {
    emptyFilters,
    filterCount,
    passes,
    periodLabel,
    periodRange,
    PERIODS,
    shiftPeriod,
    sumOf,
    type Period,
    type TxFilters,
  } from "../../lib/mobile";
  import { notify } from "../../lib/notify.svelte";
  import { cachedList, offline } from "../../lib/offline.svelte";
  import { overlay, type Pending } from "../../lib/outbox";
  import { colorOf } from "../../lib/palettes";
  import { pb } from "../../lib/pb.svelte";
  import { store } from "../../lib/store.svelte";
  import { categoryTags, tagLabel } from "../../lib/tags";
  import type { Transaction } from "../../lib/types";
  import { txModal } from "../../lib/ui.svelte";

  type Tx = Pending<Transaction>;
  type ListKey = "types" | "accounts" | "categories" | "tags";

  let { filters = $bindable(), onBack }: { filters: TxFilters; onBack: () => void } = $props();

  let panel = $state(false);
  let serverTxs = $state<Transaction[]>([]);
  let loading = $state(false);

  const count = $derived(filterCount(filters));
  const range = $derived(periodRange(filters.period, filters.ref, filters.to));
  // Sin texto ni filtros no se trae nada: "Todos" sin más sería la historia entera.
  const idle = $derived(!filters.text.trim() && !count);

  // Lo que se puede filtrar en el servidor (fechas, tipo, cuenta y categoría)
  // se filtra allá; el texto y las etiquetas, aquí.
  const serverFilter = $derived.by(() => {
    const parts: string[] = [];
    const params: Record<string, string> = {};
    if (range) {
      parts.push("date >= {:from} && date < {:to}");
      [params.from, params.to] = range;
    }
    const anyOf = (field: string, ids: string[], key: string) => {
      if (!ids.length) return;
      parts.push(`(${ids.map((id, i) => ((params[`${key}${i}`] = id), `${field} = {:${key}${i}}`)).join(" || ")})`);
    };
    anyOf("type", filters.types, "ty");
    if (filters.accounts.length) {
      const ids = filters.accounts;
      parts.push(
        `(${ids.map((id, i) => ((params[`ac${i}`] = id), `account = {:ac${i}} || to_account = {:ac${i}}`)).join(" || ")})`,
      );
    }
    anyOf("category", filters.categories, "ca");
    return parts.length ? pb.filter(parts.join(" && "), params) : "";
  });

  $effect(() => {
    void store.txVersion;
    if (idle) {
      serverTxs = [];
      return;
    }
    const filter = serverFilter;
    let alive = true;
    loading = true;
    cachedList(
      `txq:${filter}`,
      () => pb.collection("transactions").getFullList<Transaction>({ filter, sort: "-date,-created", batch: 1000 }),
      (list) => alive && (serverTxs = list),
    )
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  const results = $derived<Tx[]>(
    idle
      ? []
      : overlay("transactions", serverTxs, offline.items, (t) => passes(t, filters))
          .filter((t) => passes(t, filters))
          .toSorted((a, b) => b.date.localeCompare(a.date) || String(b.created).localeCompare(String(a.created))),
  );
  const income = $derived(sumOf(results, "income"));
  const expense = $derived(sumOf(results, "expense"));

  // Las categorías, las del tipo elegido si se eligió gasto o ingreso.
  const kinds = $derived(filters.types.filter((t) => t !== "transfer"));
  const categories = $derived(
    store.categories.filter((c) => !kinds.length || kinds.includes(c.kind) || filters.categories.includes(c.id)),
  );
  const tagOptions = $derived([...new Set([...categoryTags(), ...filters.tags])].sort());

  function toggle(key: ListKey, id: string) {
    const list = filters[key];
    filters[key] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // El calendario del periodo, abierto bajo las fichas. Un rango lo abre
  // solo: sin él no hay cómo elegir los días.
  let picking = $state(false);

  function setPeriod(p: Period) {
    filters.period = p;
    picking = p === "range";
  }

  function clearAll() {
    filters = { ...emptyFilters(), text: filters.text };
  }

  /** Las fichas de lo que está puesto, cada una con cómo quitarse. */
  const chips = $derived.by(() => {
    const out: { key: string; label: string; color?: string; remove: () => void }[] = [];
    if (filters.period !== "all")
      out.push({ key: "p", label: periodLabel(filters.period, filters.ref, filters.to), remove: () => (filters.period = "all") });
    for (const id of filters.types)
      out.push({ key: `t${id}`, label: TX_TYPES.find((x) => x.id === id)?.label ?? id, remove: () => toggle("types", id) });
    for (const id of filters.accounts) {
      const a = store.account(id);
      out.push({ key: `a${id}`, label: a?.name ?? "Cuenta", color: colorOf(a?.palette), remove: () => toggle("accounts", id) });
    }
    for (const id of filters.categories)
      out.push({ key: `c${id}`, label: store.category(id)?.name ?? "Categoría", remove: () => toggle("categories", id) });
    for (const tag of filters.tags) out.push({ key: `g${tag}`, label: `#${tagLabel(tag)}`, remove: () => toggle("tags", tag) });
    return out;
  });
</script>

<TopBar>
  <button type="button" class="btn-icon sm" aria-label="Volver" onclick={onBack}><Icon name="arrow-left-01" size={18} /></button>
  <span>Buscar</span>
  {#snippet actions()}
    <button
      type="button"
      class="btn-icon sm se-toggle"
      class:on={panel}
      aria-expanded={panel}
      aria-label={count ? `Filtros (${count} puestos)` : "Filtros"}
      onclick={() => (panel = !panel)}
    >
      <Icon name="filter-horizontal" size={18} />
      {#if count}<span class="se-badge">{count}</span>{/if}
    </button>
  {/snippet}
</TopBar>

<div class="se-box">
  <Icon name="search-01" size={16} />
  <!-- El cursor va a la caja solo si se llega a escribir: con filtros ya
       puestos (una cuenta, una categoría) se viene a ver la lista, y el
       teclado del teléfono la taparía. -->
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="search"
    placeholder="Descripción, categoría, cuenta, monto…"
    enterkeyhint="search"
    bind:value={filters.text}
    autofocus={!filters.text && !filterCount(filters)}
  />
  {#if filters.text}
    <button type="button" class="btn-icon sm" aria-label="Borrar texto" onclick={() => (filters.text = "")}>
      <Icon name="cancel-01" size={14} />
    </button>
  {/if}
</div>

{#if chips.length}
  <div class="se-chips" aria-label="Filtros puestos">
    <span class="se-chips-ico" title="Filtros puestos"><Icon name="filter" size={14} /></span>
    {#each chips as c (c.key)}
      <button type="button" class="se-chip on" aria-label="Quitar {c.label}" onclick={c.remove}>
        {#if c.color}<i style:background={c.color}></i>{/if}{c.label}<Icon name="cancel-01" size={11} />
      </button>
    {/each}
    <button type="button" class="se-clear" onclick={clearAll}><Icon name="filter-remove" size={14} />Quitar todos</button>
  </div>
{/if}

{#if panel}
  <div class="card se-panel">
    <div class="se-row">
      <span class="se-label">Periodo</span>
      <div class="se-opts">
        {#each PERIODS as p (p.id)}
          <button type="button" class="se-chip" class:on={filters.period === p.id} aria-pressed={filters.period === p.id} onclick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        {/each}
        {#if filters.period !== "all"}
          <div class="se-nav">
            {#if filters.period !== "range"}
              <button type="button" class="btn-icon sm" aria-label="Anterior" onclick={() => (filters.ref = shiftPeriod(filters.period, filters.ref, -1))}>
                <Icon name="arrow-left-01" size={16} />
              </button>
            {/if}
            <button type="button" class="se-when" aria-expanded={picking} onclick={() => (picking = !picking)}>
              {periodLabel(filters.period, filters.ref, filters.to)}<Icon name="calendar-03" size={14} />
            </button>
            {#if filters.period !== "range"}
              <button type="button" class="btn-icon sm" aria-label="Siguiente" onclick={() => (filters.ref = shiftPeriod(filters.period, filters.ref, 1))}>
                <Icon name="arrow-right-01" size={16} />
              </button>
            {/if}
          </div>
          {#if picking}
            <!-- Un calendario por forma: el día de la semana, el mes, el año o los dos días del rango. -->
            <div class="se-cal">
              {#key filters.period}
                <Calendar
                  mode={filters.period === "week" ? "day" : filters.period === "month" ? "month" : filters.period === "year" ? "year" : "range"}
                  value={filters.period === "month" ? filters.ref.slice(0, 7) : filters.period === "year" ? filters.ref.slice(0, 4) : filters.ref}
                  to={filters.period === "range" && filters.to >= filters.ref ? filters.to : ""}
                  onpick={(v, to) => {
                    if (filters.period === "range") {
                      filters.ref = v;
                      filters.to = to ?? v;
                    } else filters.ref = filters.period === "month" ? `${v}-01` : filters.period === "year" ? `${v}-01-01` : v;
                    picking = false;
                  }}
                />
              {/key}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="se-row">
      <span class="se-label">Tipo</span>
      <div class="se-opts">
        {#each TX_TYPES as t (t.id)}
          <button type="button" class="se-chip" class:on={filters.types.includes(t.id)} aria-pressed={filters.types.includes(t.id)} onclick={() => toggle("types", t.id)}>
            {t.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="se-row">
      <span class="se-label">Cuenta</span>
      <div class="se-opts">
        {#each store.activeAccounts as a (a.id)}
          <button type="button" class="se-chip" class:on={filters.accounts.includes(a.id)} aria-pressed={filters.accounts.includes(a.id)} onclick={() => toggle("accounts", a.id)}>
            <i style:background={colorOf(a.palette)}></i>{a.name}
          </button>
        {/each}
      </div>
    </div>

    <div class="se-row">
      <span class="se-label">Categoría</span>
      <div class="se-opts">
        {#each categories as c (c.id)}
          <button type="button" class="se-chip" class:on={filters.categories.includes(c.id)} aria-pressed={filters.categories.includes(c.id)} onclick={() => toggle("categories", c.id)}>
            {c.name}
          </button>
        {/each}
      </div>
    </div>

    {#if tagOptions.length}
      <div class="se-row">
        <span class="se-label">Etiqueta</span>
        <div class="se-opts">
          {#each tagOptions as tag (tag)}
            <button type="button" class="se-chip" class:on={filters.tags.includes(tag)} aria-pressed={filters.tags.includes(tag)} onclick={() => toggle("tags", tag)}>
              #{tagLabel(tag)}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <button type="button" class="se-done" onclick={() => (panel = false)}>
      Ver {results.length} {results.length === 1 ? "movimiento" : "movimientos"}
    </button>
  </div>
{:else if idle}
  <p class="se-hint">Escribe algo o elige filtros con <Icon name="filter-horizontal" size={14} /> para buscar en todos tus movimientos.</p>
{:else}
  <div class="card se-sum">
    <div><span>Ingresos</span><Money value={income} tone="income" /></div>
    <div><span>Gastos</span><Money value={expense} tone="expense" /></div>
    <div><span>Saldo neto</span><Money value={income - expense} /></div>
  </div>
  <DayList txs={results} onOpen={(t) => txModal.edit(t)} empty={loading ? "Buscando…" : "No hay movimientos con estos filtros."} />
{/if}

<style>
  .se-toggle {
    position: relative;
  }

  .se-badge {
    position: absolute;
    top: -0.125rem;
    right: -0.125rem;
    display: grid;
    place-items: center;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-pill, 99px);
    background: var(--accent);
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--accent-text);
  }

  .se-box {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    margin: var(--sp-10) var(--sp-12);
    padding: var(--sp-2, 0.125rem) var(--sp-6) var(--sp-2, 0.125rem) var(--sp-14, 0.875rem);
    border: 0;
    border-radius: var(--radius-pill);
    /* Hundido, como los campos de escritorio. */
    background: var(--field-bg, var(--bg-field));
    box-shadow: var(--field-shadow, 0 0 0 1px var(--border));
    color: var(--text-muted);
    transition: background 0.2s, box-shadow 0.2s;

    &:focus-within {
      background: var(--field-bg-focus, var(--bg-field));
      box-shadow: var(--field-shadow, none), 0 0 0 3px var(--focus-ring);
    }

    & input {
      flex: 1;
      min-width: 0;
      height: 2.5rem;
      border: 0;
      outline: 0;
      background: none;
      font: inherit;
      color: var(--text-primary);

      &::-webkit-search-cancel-button {
        display: none;
      }
    }
  }

  .se-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6);
    padding: 0 var(--sp-12) var(--sp-10);
  }

  .se-chips-ico {
    display: grid;
    place-items: center;
    color: var(--accent);
  }

  .se-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    padding: var(--sp-4) var(--sp-10);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-field);
    font: inherit;
    font-size: var(--text-xs);
    color: var(--text-primary);
    white-space: nowrap;
    cursor: pointer;

    &.on {
      border-color: var(--accent);
      background: color-mix(in oklch, var(--accent) 18%, var(--bg-field));
      font-weight: 600;
    }

    & i {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
    }
  }

  .se-clear {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--sp-6);
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--text-xs);
    color: var(--danger);
    cursor: pointer;
  }

  .se-panel {
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-4) var(--sp-4) var(--sp-12);
  }

  .se-row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: var(--sp-8);
    padding: var(--sp-10) var(--sp-12);

    & + .se-row {
      border-top: 1px solid var(--border);
    }
  }

  .se-label {
    padding-top: var(--sp-4);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .se-opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    max-height: 8.5rem;
    overflow-y: auto;
  }

  .se-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .se-when {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
    padding: var(--sp-6) var(--sp-8);
    border: 0;
    border-radius: var(--radius-pill, 99px);
    background: none;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;

    &[aria-expanded="true"] {
      background: var(--bg-field);
    }
  }

  .se-cal {
    width: 100%;
    padding-top: var(--sp-4);
  }

  .se-done {
    display: block;
    width: calc(100% - 2 * var(--sp-12));
    margin: var(--sp-4) var(--sp-12) var(--sp-12);
    padding: var(--sp-10);
    border: 0;
    border-radius: var(--radius-pill, 99px);
    background: var(--accent);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--accent-text);
    cursor: pointer;
  }

  .se-hint {
    padding: var(--sp-40) var(--sp-24, 1.5rem);
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }

  .se-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-12) var(--sp-8);
    text-align: center;

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    & div + div {
      border-left: 1px solid var(--border);
    }

    & span:first-child {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    & :global(.money) {
      font-size: var(--text-sm);
    }
  }
</style>
