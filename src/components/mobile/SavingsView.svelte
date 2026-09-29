<!--
  Ahorros en el celular: arriba lo ahorrado y el aporte del mes, luego cada
  ahorro con su meta, y al tocarlo sus abonos y retiros. Debajo, la gráfica
  de todos: lo que han tenido o lo que tendrían si siguen aportando.
-->
<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import MovementForm from "../app/MovementForm.svelte";
  import SavingForm from "../app/SavingForm.svelte";
  import Segmented from "../app/Segmented.svelte";
  import { Button } from "../ui";
  import SlideIn from "./SlideIn.svelte";
  import BackButton from "./BackButton.svelte";
  import TopBar from "./TopBar.svelte";
  import { addMonths, monthsToTarget, today } from "../../lib/finance";
  import { dateShort, monthLabel, monthsLabel } from "../../lib/format";
  import { colorOf } from "../../lib/palettes";
  import { session } from "../../lib/pb.svelte";
  import { paidAt, savingsHistory, simChart, stateChart, valueAt } from "../../lib/savingsCharts";
  import { store } from "../../lib/store.svelte";
  import type { Saving, SavingMovement } from "../../lib/types";

  /** Sin él es una pestaña: la marca arriba, sin botón de volver. */
  let { onBack }: { onBack?: () => void } = $props();

  const ym = today().slice(0, 7);
  const SHOWN = 8;
  const VIEWS = [
    { id: "estado", label: "Estado" },
    { id: "sim", label: "Simulación" },
  ] as const;

  let showArchived = $state(false);
  let view = $state<"estado" | "sim">("estado");
  let horizon = $state(24);
  const opened = new SvelteSet<string>();
  const expandedAll = new SvelteSet<string>();

  let formOpen = $state(false);
  let editing = $state<Saving | null>(null);
  let movOpen = $state(false);
  let movSaving = $state<Saving | null>(null);
  let movEditing = $state<SavingMovement | null>(null);

  const list = $derived(store.savings.filter((s) => showArchived || !s.archived));
  const active = $derived(store.activeSavings);
  const totalSaved = $derived(active.reduce((a, s) => a + store.savingCurrent(s.id), 0));
  const totalMonthly = $derived(active.reduce((a, s) => a + (s.monthly_amount || 0), 0));

  /** Los movimientos de cada ahorro, del más nuevo al más viejo, con lo que quedó después de cada uno. */
  const movsBySaving = $derived.by(() => {
    const map = new Map<string, { m: SavingMovement; after: number }[]>();
    const run = new Map<string, number>();
    for (let i = store.movements.length - 1; i >= 0; i--) {
      const m = store.movements[i];
      const after = (run.get(m.saving) ?? 0) + m.amount;
      run.set(m.saving, after);
      let l = map.get(m.saving);
      if (!l) map.set(m.saving, (l = []));
      l.unshift({ m, after });
    }
    return map;
  });

  const current = (id: string) => store.savingCurrent(id);
  const history = $derived(savingsHistory(active, store.movements, ym));
  const grown = $derived(totalSaved - history.lines.reduce((a, l) => a + l.data[0], 0));
  const future = $derived(active.reduce((a, s) => a + valueAt(s, current(s.id), horizon), 0));
  const contributed = $derived(active.reduce((a, s) => a + paidAt(s, current(s.id), horizon), 0));
  const chartConfig = () => (view === "estado" ? stateChart(history, false) : simChart(active, current, horizon, ym, false));

  function eta(s: Saving, now: number) {
    if (!s.target_amount) return null;
    const m = monthsToTarget(now, s.monthly_amount || 0, s.annual_rate || 0, s.target_amount);
    return m === null ? null : { months: m, month: addMonths(ym, m) };
  }

  const canEdit = (m: SavingMovement) => m.created_by === session.id || store.saving(m.saving)?.owner === session.id;
  const accountName = (id: string) => store.account(id)?.name ?? (id ? "Otra cuenta" : "Sin cuenta");
  /** De otra persona: en una cuenta suya, o sin cuenta y anotado por ella. */
  const isForeign = (m: SavingMovement) => (m.account ? !store.account(m.account) : m.created_by !== session.id);

  function toggle(id: string) {
    if (opened.has(id)) opened.delete(id);
    else opened.add(id);
  }

  function openMovement(s: Saving, m: SavingMovement | null = null) {
    movSaving = s;
    movEditing = m;
    movOpen = true;
  }
</script>

<TopBar brand={!onBack}>
  {#if onBack}<BackButton label="Más" onclick={onBack} />{/if}
  {#snippet actions()}
    <button
      type="button"
      class="btn-icon sm"
      class:on={showArchived}
      aria-pressed={showArchived}
      aria-label={showArchived ? "Ocultar archivados" : "Ver archivados"}
      onclick={() => (showArchived = !showArchived)}
    >
      <Icon name="archive" size={18} />
    </button>
    <button type="button" class="btn-icon sm" aria-label="Nuevo ahorro" onclick={() => ((editing = null), (formOpen = true))}>
      <Icon name="add-01" size={18} />
    </button>
  {/snippet}
</TopBar>

<header class="page-head sv-head-page">
  <div>
    <h1>Ahorros</h1>
    <p>Tus metas y cuánto les aportas al mes.</p>
  </div>
</header>

<div class="card sv-sum">
  <div><span>Ahorrado</span><Money value={totalSaved} tone="income" /></div>
  <div><span>Aporte al mes</span><Money value={totalMonthly} /></div>
</div>

{#each list as s (s.id)}
  {@const now = store.savingCurrent(s.id)}
  {@const e = eta(s, now)}
  {@const holders = store.savingHolders(s.id)}
  {@const pct = s.target_amount ? Math.min(100, Math.max(0, (now / s.target_amount) * 100)) : 0}
  {@const movs = movsBySaving.get(s.id) ?? []}
  {@const open = opened.has(s.id)}
  <section class="card sv" class:archived={s.archived} style:--c={colorOf(s.palette)}>
    <button type="button" class="sv-head" aria-expanded={open} onclick={() => toggle(s.id)}>
      <span class="sv-ico"><Icon name={s.icon || "piggy-bank"} size={18} /></span>
      <span class="sv-name">
        <span class="sv-title">
          {s.name}
          {#if s.members?.length || s.owner !== session.id}<Icon name="user-multiple" size={12} />{/if}
        </span>
        <span class="sv-sub">
          <Money value={s.monthly_amount} /> al mes{s.annual_rate ? ` · ${s.annual_rate}% anual` : ""}{s.auto ? " · automático" : ""}
        </span>
      </span>
      <Money value={now} />
    </button>
    {#if s.target_amount}
      <div class="sv-goal">
        <span class="bar-track"><span style:width="{pct}%"></span></span>
        <span class="sv-sub">
          {Math.round(pct)}% de <Money value={s.target_amount} /> ·
          {#if e && e.months === 0}alcanzada{:else if e}{monthLabel(e.month, true)}{:else}sin fecha estimada{/if}
        </span>
      </div>
    {/if}
    {#if open}
      <div class="sv-body">
        {#if holders.length}
          <!-- Las cuentas propias y, debajo, lo de cada persona en las suyas. -->
          <div class="sv-accs">
            {#each holders as h (h.key)}
              {#if h.person}
                <span class="sv-acc"><Icon name="user" size={11} />{store.personName(h.person)} <Money value={h.amount} /></span>
              {:else}
                <span class="sv-acc"><i style:background={colorOf(store.account(h.account ?? "")?.palette)}></i>{accountName(h.account ?? "")} <Money value={h.amount} /></span>
              {/if}
            {/each}
          </div>
        {/if}
        {#if movs.length}
          <ul class="sv-movs" aria-label="Aportes y retiros de {s.name}">
            {#each expandedAll.has(s.id) ? movs : movs.slice(0, SHOWN) as { m, after } (m.id)}
              <li>
                <button type="button" disabled={!canEdit(m)} onclick={() => openMovement(s, m)}>
                  <span class="mv-kind" class:out={m.amount < 0}><Icon name={m.amount < 0 ? "trade-down" : "trade-up"} size={14} /></span>
                  <span class="mv-main">
                    <span>{m.note && m.note !== "Aporte" && m.note !== "Retiro" ? m.note : m.amount < 0 ? "Retiro" : "Aporte"}</span>
                    <span class="sv-sub">{dateShort(m.date)} {m.date.slice(0, 4)} · {isForeign(m) ? store.personName(m.created_by) : accountName(m.account)}</span>
                  </span>
                  <span class="mv-amt">
                    <Money value={m.amount} tone="auto" />
                    <span class="sv-sub">Quedó <Money value={after} /></span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
          {#if movs.length > SHOWN && !expandedAll.has(s.id)}
            <button type="button" class="sv-more" onclick={() => expandedAll.add(s.id)}>Ver los {movs.length} movimientos</button>
          {/if}
        {:else}
          <p class="sv-empty">Todavía no hay aportes ni retiros.</p>
        {/if}
        <div class="sv-actions">
          <Button size="sm" variant="secondary" onclick={() => openMovement(s)}><Icon name="add-circle" />Movimiento</Button>
          <Button size="sm" variant="ghost" onclick={() => ((editing = s), (formOpen = true))}><Icon name="edit-02" />Editar</Button>
        </div>
      </div>
    {/if}
  </section>
{:else}
  <p class="sv-empty pad">No hay ahorros registrados. Crea uno y define cuánto guardarás al mes.</p>
{/each}

{#if active.length}
  <section class="card sv-chart">
    <Segmented bind:value={view} options={VIEWS} tabs full label="Vista de la gráfica" />
    <SlideIn key={view} order={VIEWS.map((v) => v.id)}>
      {#if view === "estado"}
        <div class="sv-result">
          <Money value={totalSaved} />
          {#if grown}<span class="sv-sub">{grown > 0 ? "Creció" : "Bajó"} <Money value={Math.abs(grown)} /> desde {monthLabel(history.months[0], true)}</span>{/if}
        </div>
      {:else}
        <label class="sv-slider">
          <span>En <b>{monthsLabel(horizon)}</b> ({monthLabel(addMonths(ym, horizon), true)})</span>
          <input type="range" class="field-control" min="1" max="120" bind:value={horizon} />
        </label>
        <div class="sv-result">
          <Money value={future} />
          {#if future > contributed + 1}<span class="sv-sub">Incluye <Money value={future - contributed} /> de intereses estimados</span>{/if}
        </div>
      {/if}
      <Chart config={chartConfig} height={220} label={view === "estado" ? "Dinero ahorrado mes a mes" : "Cálculo del ahorro a futuro"} />
    </SlideIn>
  </section>
{/if}

<SavingForm open={formOpen} saving={editing} onClose={() => (formOpen = false)} />
<MovementForm open={movOpen} saving={movSaving} movement={movEditing} onClose={() => (movOpen = false)} />

<style>
  .sv-head-page {
    margin: 0;
    padding: var(--sp-16) var(--sp-16) 0;
  }

  .sv-sum {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: var(--sp-12) var(--sp-12);
    padding: var(--sp-12) var(--sp-8);
    text-align: center;

    & > div + div {
      border-left: 1px solid var(--border);
    }

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    & span:first-child {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .sv {
    margin: 0 var(--sp-12) var(--sp-12);
    overflow: hidden;

    &.archived {
      opacity: 0.55;
    }
  }

  .sv-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-12) var(--sp-16);
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;

    &:active {
      background: var(--bg-hover);
    }

    & > :global(.money) {
      font-size: var(--text-base);
      font-weight: 600;
    }
  }

  .sv-ico {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: oklch(from var(--c) l c h / 0.18);
    color: var(--c);
  }

  .sv-name {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sv-title {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;

    & :global(i) {
      color: var(--text-muted);
    }
  }

  .sv-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .sv-goal {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: 0 var(--sp-16) var(--sp-12) calc(var(--sp-16) + 2.25rem + var(--sp-10));

    & .bar-track span {
      background: var(--c);
    }
  }

  .sv-body {
    padding: 0 var(--sp-16) var(--sp-12);
  }

  .sv-accs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    margin-bottom: var(--sp-8);
  }

  .sv-acc {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-2, 0.125rem) var(--sp-8);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-hover);
    font-size: var(--text-xs);

    & i {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
    }
  }

  .sv-movs {
    margin: 0;
    padding: 0;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--bg-hover);
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }

    & button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sp-8);
      width: 100%;
      padding: var(--sp-8) var(--sp-10);
      border: 0;
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;

      &:disabled {
        cursor: default;
      }
    }
  }

  .mv-kind {
    color: var(--success);

    &.out {
      color: var(--danger);
    }
  }

  .mv-main,
  .mv-amt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .mv-main > span:first-child {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .mv-amt {
    align-items: flex-end;
  }

  .sv-more {
    margin-top: var(--sp-6);
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--accent);
    cursor: pointer;
  }

  .sv-actions {
    display: flex;
    gap: var(--sp-8);
    margin-top: var(--sp-10);
  }

  .sv-empty {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);

    &.pad {
      margin: 0 var(--sp-12) var(--sp-12);
      padding: var(--sp-40) var(--sp-16);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      text-align: center;
    }
  }

  .sv-chart {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-16);

    /* Lo que entra al cambiar de vista (ver SlideIn) sigue la misma columna. */
    & :global(.si-page) {
      display: flex;
      flex-direction: column;
      gap: var(--sp-12);
    }
  }

  .sv-result {
    display: flex;
    flex-direction: column;

    & > :global(.money) {
      font-family: var(--font-num);
      font-size: 1.375rem;
      font-weight: 700;
    }
  }

  .sv-slider {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    font-size: var(--text-sm);
  }
</style>
