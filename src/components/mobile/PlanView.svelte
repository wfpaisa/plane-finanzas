<!--
  Gastos e ingresos en el celular: los programados del mes para marcar, los ingresos y pagos programados y cómo se reparten los
  próximos meses.
-->
<script lang="ts">
  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import CategoryPill from "../app/CategoryPill.svelte";
  import Money from "../app/Money.svelte";
  import PlanCards from "../app/PlanCards.svelte";
  import RecurringForm from "../app/RecurringForm.svelte";
  import RecurringMonth from "../app/RecurringMonth.svelte";
  import Segmented from "../app/Segmented.svelte";
  import SlideIn from "./SlideIn.svelte";
  import BackButton from "./BackButton.svelte";
  import TopBar from "./TopBar.svelte";
  import { activeIn, monthlyEquivalent, today, type Kind, type TxType } from "../../lib/finance";
  import { monthLabel, monthName } from "../../lib/format";
  import { nextMonthsChart } from "../../lib/planCharts";
  import { closeOnBack } from "../../lib/router.svelte";
  import { store } from "../../lib/store.svelte";
  import type { Recurring } from "../../lib/types";

  /** Sin él es una pestaña: la marca arriba, sin botón de volver. */
  let { onBack }: { onBack?: () => void } = $props();

  const thisYm = today().slice(0, 7);
  // El plan sigue al mes que se ve en la lista del mes.
  let ym = $state(thisYm);
  const KINDS = [
    { id: "income", label: "Ingresos" },
    { id: "expense", label: "Gastos" },
  ] as const;

  let formOpen = $state(false);
  let editing = $state<Recurring | null>(null);
  let newKind = $state<TxType>("expense");
  let kind = $state<Kind>("expense");

  // Las transferencias van con los gastos: también son pagos. Solo suman en el plan las que reservan dinero para un pago.
  const items = $derived(store.recurring.filter((r) => (kind === "income" ? r.kind === "income" : r.kind !== "income")));

  // El botón de atrás del teléfono cierra el formulario en vez de salir de la pantalla.
  $effect(() => {
    if (formOpen) return closeOnBack(() => (formOpen = false));
  });

  const nextConfig = () => nextMonthsChart(store.recurring, store.plan.savings, thisYm);

  function edit(r: Recurring | null, k: TxType = kind) {
    editing = r;
    newKind = k;
    formOpen = true;
  }

  const freqLabel = (r: Recurring) =>
    r.frequency === "yearly"
      ? `Anual · ${monthName(r.month || 1)}`
      : r.frequency === "once"
        ? `Una vez · ${r.start_date?.slice(0, 10) ?? ""}`
        : r.day_of_month
          ? `Día ${r.day_of_month}`
          : "Sin día fijo";

  const outOfPlan = (r: Recurring) => {
    if (r.paused || r.frequency === "once" || activeIn(r, thisYm)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < thisYm ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };
</script>

<TopBar brand={!onBack}>
  {#if onBack}<BackButton label="Más" onclick={onBack} />{/if}
  {#snippet actions()}
    <button type="button" class="btn sm" onclick={() => edit(null)}>
      <Icon name="add-01" />Programar
    </button>
  {/snippet}
</TopBar>

<header class="page-head pl-head">
  <div>
    <h1>Gastos e ingresos</h1>
    <p>Marca los pagos e ingresos programados de cada mes cuando los hagas o los recibas.</p>
  </div>
</header>

<div class="pl-month"><RecurringMonth mobile bind:ym /></div>

<header class="section-head pl-section">
  <div>
    <h2>Plan de {monthLabel(ym, true)}</h2>
    <p>Cuánto reservar y cuánto queda para gastar.</p>
  </div>
</header>

<div class="pl-cards"><PlanCards {ym} /></div>

<section class="card pl-block">
  <Segmented bind:value={kind} options={KINDS} tabs full label="Movimientos programados" />
  <SlideIn key={kind} order={KINDS.map((k) => k.id)}>
    <ul class="pl-list">
      {#each items as r (r.id)}
        {@const out = outOfPlan(r)}
        <li>
          <button type="button" class:paused={r.paused || !!out} onclick={() => edit(r)}>
            <span class="pl-main">
              <span class="pl-name">{r.name}</span>
              <span class="pl-sub">
                {#if r.kind === "transfer"}{r.for_payment ? "Reservada para un pago" : "Transferencia"} · {/if}{freqLabel(r)}{#if r.auto_create} · registro automático{/if}{#if r.saving} · reserva mensual{/if}{#if r.paused} · en pausa{/if}{#if out} · {out}{/if}
              </span>
              {#if r.category}<CategoryPill id={r.category} />{/if}
            </span>
            <span class="pl-amt">
              <Money value={r.amount} tone={r.kind} />
              {#if r.frequency === "yearly"}<span class="pl-sub"><Money value={monthlyEquivalent(r)} />/mes</span>{/if}
            </span>
          </button>
        </li>
      {:else}
        <li class="pl-empty">{kind === "income" ? "No hay ingresos programados. Programa tu sueldo u otro ingreso habitual." : "No hay pagos programados. Programa servicios, cuotas u otros pagos habituales."}</li>
      {/each}
    </ul>
    <button type="button" class="pl-add" onclick={() => edit(null)}>
      <Icon name="add-circle" />{kind === "income" ? "Programar ingreso" : "Programar pago"}
    </button>
  </SlideIn>
</section>

<header class="section-head pl-section">
  <div>
    <h2>Próximos 12 meses</h2>
    <p>Compara los ingresos con los pagos y ahorros de cada mes. Si una columna supera la línea punteada, los ingresos no alcanzan.</p>
  </div>
</header>

<section class="card pl-block pl-next">
  <Chart config={nextConfig} height={220} square label="Plan de los próximos 12 meses" />
</section>

<RecurringForm open={formOpen} item={editing} kind={newKind} onClose={() => (formOpen = false)} />

<style>
  .pl-month {
    margin: var(--sp-12);
  }

  /* Los títulos de sección van fuera de las tarjetas, alineados con su borde. */
  .pl-section {
    margin: var(--sp-20) var(--sp-12) 0;
  }

  .pl-head {
    margin: 0;
    padding: var(--sp-16) var(--sp-16) 0;
  }

  .pl-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .pl-cards {
    margin: var(--sp-12);
  }

  .pl-block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-16);

    /* Lo que entra al cambiar de pestaña (ver SlideIn) sigue la misma columna. */
    & :global(.si-page) {
      display: flex;
      flex-direction: column;
      gap: var(--sp-10);
    }
  }

  .pl-next {
    margin-top: var(--sp-12);
  }

  .pl-list {
    margin: 0;
    padding: 0;
    font-size: var(--text-sm);
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }

    & button {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sp-10);
      width: 100%;
      padding: var(--sp-10) 0;
      border: 0;
      background: none;
      font: inherit;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;

      &.paused {
        opacity: 0.55;
      }
    }
  }

  .pl-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2, 0.125rem);
    min-width: 0;
  }

  .pl-name {
    max-width: 100%;
    overflow: hidden;
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .pl-amt {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .pl-empty {
    padding: var(--sp-16) 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }

  .pl-add {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--sp-6);
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--accent);
    cursor: pointer;
  }



</style>
