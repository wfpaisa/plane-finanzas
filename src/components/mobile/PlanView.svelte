<!--
  Proyección en el celular: lo que queda libre cada mes (ingresos menos
  fijos y ahorros), los ingresos y gastos frecuentes, cómo se reparten los
  próximos meses.
-->
<script lang="ts">
  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import CategoryPill from "../app/CategoryPill.svelte";
  import Money from "../app/Money.svelte";
  import RecurringForm from "../app/RecurringForm.svelte";
  import RecurringMonth from "../app/RecurringMonth.svelte";
  import Segmented from "../app/Segmented.svelte";
  import SlideIn from "./SlideIn.svelte";
  import BackButton from "./BackButton.svelte";
  import TopBar from "./TopBar.svelte";
  import { activeIn, monthlyEquivalent, today, type Kind, type TxType } from "../../lib/finance";
  import { monthLabel, monthName } from "../../lib/format";
  import { nextMonthsChart } from "../../lib/planCharts";
  import { store } from "../../lib/store.svelte";
  import type { Recurring } from "../../lib/types";

  let { onBack }: { onBack: () => void } = $props();

  const ym = today().slice(0, 7);
  const KINDS = [
    { id: "income", label: "Ingresos" },
    { id: "expense", label: "Gastos" },
  ] as const;

  let formOpen = $state(false);
  let editing = $state<Recurring | null>(null);
  let newKind = $state<TxType>("expense");
  let kind = $state<Kind>("expense");

  const plan = $derived(store.plan);
  // Las transferencias van con los gastos: también son pagos, aunque no sumen en el plan.
  const items = $derived(store.recurring.filter((r) => (kind === "income" ? r.kind === "income" : r.kind !== "income")));
  const barBase = $derived(Math.max(plan.income, plan.fixed + plan.savings));
  const share = (n: number) => (plan.income > 0 ? Math.max(0, (n / plan.income) * 100) : 0);
  const width = (n: number) => (barBase > 0 ? Math.max(0, (n / barBase) * 100) : 0);

  const nextConfig = () => nextMonthsChart(store.recurring, plan.savings, ym);

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
    if (r.paused || r.frequency === "once" || activeIn(r, ym)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < ym ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };
</script>

<TopBar>
  <BackButton label="Más" onclick={onBack} />
  {#snippet actions()}
    <button type="button" class="btn sm" onclick={() => edit(null)}>
      <Icon name="add-01" />Programar
    </button>
  {/snippet}
</TopBar>

<header class="page-head pl-head">
  <div>
    <h1>Proyección</h1>
    <p>Organiza tus ingresos y pagos programados para saber cuánto dinero tendrás disponible.</p>
  </div>
</header>

<div class="pl-month"><RecurringMonth /></div>

<header class="page-head pl-head pl-section">
  <div>
    <h2>Tu plan mensual</h2>
    <p>Compara lo que esperas recibir con tus pagos y ahorros mensuales.</p>
  </div>
</header>

<section class="card pl-top">
  <div class="pl-free" class:short={plan.free < 0}>
    <span class="pl-label">Disponible para gastar</span>
    <Money value={plan.free} />
    {#if plan.income > 0}
      <span class="pl-sub">{plan.free < 0 ? "Tus pagos y ahorros superan tus ingresos mensuales" : `${Math.round(share(plan.free))}% de tus ingresos mensuales`}</span>
    {/if}
  </div>
  <div class="pl-bar" aria-hidden="true">
    <span class="seg-fixed" style:width="{width(plan.fixed)}%"></span>
    <span class="seg-save" style:width="{width(plan.savings)}%"></span>
    <span class="seg-free" style:width="{width(plan.free)}%"></span>
  </div>
  <dl class="pl-sum">
    <div><dt>Ingresos</dt><dd><Money value={plan.income} tone="income" /></dd></div>
    <div><dt><i class="seg-fixed"></i>Pagos</dt><dd><Money value={plan.fixed} tone="expense" /></dd></div>
    <div><dt><i class="seg-save"></i>Ahorros</dt><dd><Money value={plan.savings} /></dd></div>
  </dl>
</section>

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
                {#if r.kind === "transfer"}Transferencia · {/if}{freqLabel(r)}{#if r.auto_create} · registro automático{/if}{#if r.saving} · reserva mensual{/if}{#if r.paused} · en pausa{/if}{#if out} · {out}{/if}
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
        <li class="pl-empty">{kind === "income" ? "Aún no hay ingresos programados. Agrega tu sueldo u otro ingreso habitual." : "Aún no hay pagos programados. Agrega servicios, cuotas u otros pagos habituales."}</li>
      {/each}
    </ul>
    <button type="button" class="pl-add" onclick={() => edit(null)}>
      <Icon name="add-circle" />{kind === "income" ? "Programar ingreso" : "Programar pago"}
    </button>
  </SlideIn>
</section>

<section class="card pl-block">
  <h3>Próximos 12 meses</h3>
  <p class="pl-sub">Compara los ingresos con los pagos y ahorros de cada mes. Si una columna supera la línea punteada, los ingresos no alcanzan.</p>
  <Chart config={nextConfig} height={220} square label="Plan de los próximos 12 meses" />
</section>

<RecurringForm open={formOpen} item={editing} kind={newKind} onClose={() => (formOpen = false)} />

<style>
  .pl-month {
    margin: var(--sp-12);
  }

  .pl-head.pl-section {
    padding-top: var(--sp-8);

    & h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  }

  .pl-head {
    margin: 0;
    padding: var(--sp-16) var(--sp-16) 0;
  }

  .pl-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .pl-top {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    margin: var(--sp-12);
    padding: var(--sp-16);
  }

  .pl-free {
    --tone: var(--viz-free);

    display: flex;
    flex-direction: column;
    padding: var(--sp-12) var(--sp-16);
    border: 1px solid oklch(from var(--tone) l c h / 0.4);
    border-radius: var(--radius-lg);
    background:
      radial-gradient(120% 140% at 100% 0%, oklch(from var(--tone) l c h / 0.28), transparent 60%),
      oklch(from var(--tone) l c h / 0.1);

    &.short {
      --tone: var(--viz-expense);
    }

    & .pl-label {
      font-size: var(--text-xs);
      color: light-dark(oklch(from var(--tone) calc(l - 0.14) c h), var(--tone));
    }

    & > :global(.money) {
      font-family: var(--font-num);
      font-size: 1.5rem;
      font-weight: 700;
    }
  }

  .pl-bar {
    display: flex;
    height: 0.5rem;
    overflow: hidden;
    border-radius: var(--radius-pill, 99px);
    background: var(--field-bg, var(--bg-hover));
    box-shadow: var(--field-shadow, none);
  }

  .seg-fixed {
    background: var(--viz-expense);
  }

  .seg-save {
    background: var(--viz-saving);
  }

  .seg-free {
    background: var(--viz-free);
  }

  .pl-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
    text-align: center;

    & div {
      min-width: 0;
    }

    & dt {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sp-4);
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    & dt i {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 2px;
    }

    & dd {
      margin: 0;
      font-size: var(--text-sm);
    }
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

    & h3 {
      margin: 0;
      font-size: var(--text-base);
    }

    & > .pl-sub {
      margin: calc(var(--sp-6) * -1) 0 0;
    }
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
