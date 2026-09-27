<!--
  Plan futuro en el celular: lo que queda libre cada mes (ingresos menos
  fijos y ahorros), los ingresos y gastos frecuentes, cómo se reparten los
  próximos meses y el simulador del dinero total.
-->
<script lang="ts">
  import Chart from "../Chart.svelte";
  import Icon from "../Icon.svelte";
  import CategoryPill from "../app/CategoryPill.svelte";
  import Money from "../app/Money.svelte";
  import MoneyInput from "../app/MoneyInput.svelte";
  import RecurringForm from "../app/RecurringForm.svelte";
  import Segmented from "../app/Segmented.svelte";
  import { Field } from "../ui";
  import SlideIn from "./SlideIn.svelte";
  import BackButton from "./BackButton.svelte";
  import TopBar from "./TopBar.svelte";
  import { activeIn, monthlyEquivalent, simulate, today, whenTotalReaches, type Kind } from "../../lib/finance";
  import { monthLabel, monthName, monthsLabel } from "../../lib/format";
  import { nextMonthsChart, simulationChart } from "../../lib/planCharts";
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
  let newKind = $state<Kind>("expense");
  let kind = $state<Kind>("expense");

  let months = $state(24);
  let spendPct = $state(100);
  let extra = $state(0);
  let baseRate = $state(0);
  let goal = $state(0);

  const plan = $derived(store.plan);
  const items = $derived(store.recurring.filter((r) => r.kind === kind));
  const barBase = $derived(Math.max(plan.income, plan.fixed + plan.savings));
  const share = (n: number) => (plan.income > 0 ? Math.max(0, (n / plan.income) * 100) : 0);
  const width = (n: number) => (barBase > 0 ? Math.max(0, (n / barBase) * 100) : 0);

  // Como en escritorio: en un ahorro compartido solo cuenta la parte propia.
  const simSavings = $derived(
    store.activeSavings
      .map((s) => ({ ...s, share: store.savingShare(s), current: store.savingMine(s.id) }))
      .filter((s) => s.share > 0 || s.current !== 0),
  );
  const simInput = $derived({
    from: ym,
    total: store.total,
    recurring: store.recurring,
    savings: simSavings,
    spendRatio: spendPct / 100,
    extraMonthly: extra,
    baseRate,
  });
  const sim = $derived(simulate({ ...simInput, months: Math.max(months, 1) }));
  const last = $derived(sim[sim.length - 1]);
  const longSim = $derived(goal > store.total ? simulate({ ...simInput, months: 600 }) : []);
  const reach = $derived(goal > store.total ? whenTotalReaches(longSim, goal) : null);
  const reachIn = $derived(reach ? longSim.indexOf(reach) + 1 : 0);

  const nextConfig = () => nextMonthsChart(store.recurring, plan.savings, ym);
  const simConfig = () => simulationChart(sim, simSavings, store.total);

  function edit(r: Recurring | null, k: Kind = kind) {
    editing = r;
    newKind = k;
    formOpen = true;
  }

  const freqLabel = (r: Recurring) =>
    r.frequency === "yearly"
      ? `Anual · ${monthName(r.month || 1)}`
      : r.frequency === "once"
        ? `Una vez · ${r.start_date?.slice(0, 10) ?? ""}`
        : `Día ${r.day_of_month || 1}`;

  const outOfPlan = (r: Recurring) => {
    if (r.paused || r.frequency === "once" || activeIn(r, ym)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < ym ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };
</script>

<TopBar>
  <BackButton label="Más" onclick={onBack} />
  {#snippet actions()}
    <button type="button" class="btn-icon sm" aria-label="Agregar frecuente" onclick={() => edit(null)}>
      <Icon name="add-01" size={18} />
    </button>
  {/snippet}
</TopBar>

<header class="page-head pl-head">
  <div>
    <h1>Plan futuro</h1>
    <p>Cuánto puedes gastar al mes y cómo cambiaría tu dinero con el tiempo.</p>
  </div>
</header>

<section class="card pl-top">
  <div class="pl-free" class:short={plan.free < 0}>
    <span class="pl-label">Disponible para otros gastos</span>
    <Money value={plan.free} />
    {#if plan.income > 0}
      <span class="pl-sub">{plan.free < 0 ? "Te faltan cada mes" : `${Math.round(share(plan.free))}% de tus ingresos al mes`}</span>
    {/if}
  </div>
  <div class="pl-bar" aria-hidden="true">
    <span class="seg-fixed" style:width="{width(plan.fixed)}%"></span>
    <span class="seg-save" style:width="{width(plan.savings)}%"></span>
    <span class="seg-free" style:width="{width(plan.free)}%"></span>
  </div>
  <dl class="pl-sum">
    <div><dt>Ingresos</dt><dd><Money value={plan.income} tone="income" /></dd></div>
    <div><dt><i class="seg-fixed"></i>Frecuentes</dt><dd><Money value={plan.fixed} tone="expense" /></dd></div>
    <div><dt><i class="seg-save"></i>Ahorros</dt><dd><Money value={plan.savings} /></dd></div>
  </dl>
</section>

<section class="card pl-block">
  <Segmented bind:value={kind} options={KINDS} tabs full label="Frecuentes" />
  <SlideIn key={kind} order={KINDS.map((k) => k.id)}>
    <ul class="pl-list">
      {#each items as r (r.id)}
        {@const out = outOfPlan(r)}
        <li>
          <button type="button" class:paused={r.paused || !!out} onclick={() => edit(r)}>
            <span class="pl-main">
              <span class="pl-name">{r.name}</span>
              <span class="pl-sub">
                {freqLabel(r)}{#if r.auto_create} · automático{/if}{#if r.paused} · pausado{/if}{#if out} · {out}{/if}
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
        <li class="pl-empty">{kind === "income" ? "Agrega tu sueldo u otros ingresos." : "Crédito, servicios, administración…"}</li>
      {/each}
    </ul>
    <button type="button" class="pl-add" onclick={() => edit(null)}>
      <Icon name="add-circle" />{kind === "income" ? "Ingreso recurrente" : "Gasto recurrente"}
    </button>
  </SlideIn>
</section>

<section class="card pl-block">
  <h3>Próximos 12 meses</h3>
  <p class="pl-sub">En qué se va el ingreso de cada mes. Si una columna pasa la línea punteada, ese mes no alcanza.</p>
  <Chart config={nextConfig} height={220} square label="Plan de los próximos 12 meses" />
</section>

<section class="card pl-block">
  <h3>Simulador</h3>
  <p class="pl-sub">Hoy tienes <Money value={store.total} /> en total.</p>
  <label class="pl-slider">
    <span>Tiempo: <b>{monthsLabel(months)}</b></span>
    <input type="range" class="field-control" min="1" max="120" bind:value={months} />
  </label>
  <label class="pl-slider">
    <span>Gastarías el <b>{spendPct}%</b> de lo disponible</span>
    <input type="range" class="field-control" min="0" max="100" step="5" bind:value={spendPct} />
  </label>
  <Field label="Cambio adicional cada mes"><MoneyInput bind:value={extra} allowNegative /></Field>
  <Field label="Interés anual del dinero no reservado (%)">
    <input type="number" class="field-control w-full" inputmode="decimal" min="0" max="50" step="0.5" bind:value={baseRate} />
  </Field>

  {#if last}
    <div class="pl-answer">
      <div class="pl-big">
        <span class="pl-sub">Total estimado para {monthLabel(last.month, true)}</span>
        <Money value={last.total} />
      </div>
      <div>
        <span class="pl-sub">En ahorros</span>
        <Money value={last.savingsTotal} />
      </div>
      <div>
        <span class="pl-sub">Frente a hoy</span>
        <Money value={last.total - store.total} tone="auto" />
      </div>
    </div>
  {/if}

  <Chart config={simConfig} height={240} label="Cálculo del saldo neto a futuro" />

  <Field label="¿Para cuándo tendría…?"><MoneyInput bind:value={goal} placeholder="200.000.000" /></Field>
  <p class="pl-goal">
    {#if !goal}
      <span class="pl-sub">Escribe una cifra y te digo la fecha.</span>
    {:else if goal <= store.total}
      ¡Ya la tienes! 🎉
    {:else if reach}
      Llegarías en <b>{monthLabel(reach.month, true)}</b> ({monthsLabel(reachIn)}).
    {:else}
      <span class="pl-sub">No se alcanzaría en 50 años con estos valores.</span>
    {/if}
  </p>
</section>

<RecurringForm open={formOpen} item={editing} kind={newKind} onClose={() => (formOpen = false)} />

<style>
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

  .pl-slider {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    font-size: var(--text-sm);
  }

  .pl-answer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-8) var(--sp-12);

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    & .pl-big {
      grid-column: 1 / -1;

      & :global(.money) {
        font-family: var(--font-num);
        font-size: 1.375rem;
        font-weight: 700;
      }
    }
  }

  .pl-goal {
    margin: 0;
    font-size: var(--text-sm);
  }
</style>
