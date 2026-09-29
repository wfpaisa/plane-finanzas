<!--
  Proyección: el plan del mes (ingresos, fijos, ahorros y lo que se puede
  gastar), lo que toca pagar cada mes y los recurrentes.
-->
<script lang="ts">
  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import RecurringForm from "../components/app/RecurringForm.svelte";
  import RecurringMonth from "../components/app/RecurringMonth.svelte";
  import Icon from "../components/Icon.svelte";
  import { band, flowLayout } from "../lib/analysis";
  import { activeIn, monthlyEquivalent, today, type TxType } from "../lib/finance";
  import { monthLabel, monthName } from "../lib/format";
  import { store } from "../lib/store.svelte";
  import type { Recurring } from "../lib/types";

  const ym = today().slice(0, 7);

  let formOpen = $state(false);
  let editing = $state<Recurring | null>(null);
  let newKind = $state<TxType>("expense");

  const plan = $derived(store.plan);
  const incomes = $derived(store.recurring.filter((r) => r.kind === "income"));
  // Las transferencias van con los gastos: también son pagos, aunque no sumen en el plan.
  const expenses = $derived(store.recurring.filter((r) => r.kind !== "income"));

  const share = (n: number) => (plan.income > 0 ? Math.max(0, (n / plan.income) * 100) : 0);
  // El flujo del ingreso: a la derecha, a dónde va cada peso. Si lo
  // planeado se pasa del ingreso, la última banda es lo que falta, y la
  // barra del ingreso cubre solo la parte que alcanza a pagar.
  const FLOW_W = 1000;
  const FLOW_H = 220;
  const NODE = 12;
  const flow = $derived(
    flowLayout(
      [],
      [
        { id: "fixed", label: "Pagos programados", value: plan.fixed, tint: "seg-fixed" },
        { id: "save", label: "Ahorros", value: plan.savings, tint: "seg-save" },
        plan.free < 0
          ? { id: "short", label: "Te falta cada mes", value: -plan.free, tint: "seg-short" }
          : { id: "free", label: "Disponible para gastar", value: plan.free, tint: "seg-free" },
      ].filter((p) => p.value > 0),
      FLOW_H,
      8,
      60,
    ),
  );
  const inH = $derived(flow.total ? (FLOW_H * Math.min(plan.income, flow.total)) / flow.total : 0);

  function edit(r: Recurring | null, kind: TxType = "expense") {
    editing = r;
    newKind = kind;
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

  /** Por qué un fijo no suma en el plan de este mes: ya terminó o aún no empieza. */
  const outOfPlan = (r: Recurring) => {
    if (r.paused || r.frequency === "once" || activeIn(r, ym)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < ym ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };

</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Proyección</h1>
      <p>Organiza tus ingresos y pagos programados para saber cuánto dinero tendrás disponible.</p>
    </div>
  </header>

  <div class="stack">
    <RecurringMonth />

    <!-- De aquí en adelante, el plan: en qué se va el ingreso y los recurrentes que lo forman. -->
    <header class="page-head plan-section">
      <div>
        <h2 id="plan-title">Tu plan mensual</h2>
        <p>Compara lo que esperas recibir con tus pagos y ahorros mensuales.</p>
      </div>
    </header>

    <!-- El ingreso a la izquierda se abre en bandas hacia lo que se lleva
         cada parte, cada una del grueso de su monto. Lo que queda para
         gastar es la respuesta, y va más grande. -->
    <div class="card plan-card">
      {#if plan.income > 0}
        <div class="pflow" style:height="{FLOW_H}px">
          <div class="pflow-labels left">
            <div class="pflow-label" style:top="{(Math.min(inH, FLOW_H) / 2 / FLOW_H) * 100}%">
              <span class="pflow-name">Ingresos mensuales</span>
              <span class="pflow-amount"><Money value={plan.income} /></span>
            </div>
          </div>
          <svg viewBox="0 0 {FLOW_W} {FLOW_H}" preserveAspectRatio="none" aria-hidden="true">
            {#each flow.right as n (n.id)}
              <path class="pflow-band {n.tint}" d={band(NODE, n.my, n.mh, FLOW_W - NODE, n.y, n.h)} />
              <rect class="pflow-node {n.tint}" x={FLOW_W - NODE} y={n.y} width={NODE} height={n.h} rx="3" />
            {/each}
            <rect class="pflow-income" x="0" y="0" width={NODE} height={inH} rx="3" />
          </svg>
          <div class="pflow-labels right">
            {#each flow.right as n (n.id)}
              {@const main = n.id === "free" || n.id === "short"}
              <div class="pflow-label {n.tint}" class:main style:top="{((n.y + n.h / 2) / FLOW_H) * 100}%">
                <span class="pflow-name">{n.label} · {Math.round(share(n.value))}%</span>
                <span class="pflow-amount"><Money value={n.value} /></span>
                {#if n.id === "short"}<span class="pflow-sub">Tus pagos y ahorros superan tus ingresos.</span>{/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="muted small">Agrega al menos un ingreso programado para calcular cuánto puedes destinar a pagos, ahorros y otros gastos.</p>
      {/if}
    </div>

    <div class="split-even">
      <div class="card">
        <div class="card-head">
          <div><h3 class="card-title">Ingresos programados</h3><p class="card-sub">Total mensual estimado: <Money value={plan.income} /></p></div>
          <div class="card-head-actions"><button type="button" class="btn sm" onclick={() => edit(null, "income")}><Icon name="add-01" />Agregar ingreso</button></div>
        </div>
        <div class="card-body">
          {#each incomes as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">Aún no hay ingresos programados. Agrega tu sueldo u otro ingreso habitual.</div>
          {/each}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3 class="card-title">Pagos programados</h3><p class="card-sub">Total mensual estimado: <Money value={plan.fixed} /></p></div>
          <div class="card-head-actions"><button type="button" class="btn sm" onclick={() => edit(null, "expense")}><Icon name="add-01" />Agregar gasto</button></div>
        </div>
        <div class="card-body">
          {#each expenses as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">Aún no hay pagos programados. Agrega servicios, cuotas u otros pagos habituales.</div>
          {/each}
        </div>
      </div>
    </div>

  </div>
</div>

{#snippet row(r: Recurring)}
  {@const out = outOfPlan(r)}
  <button type="button" class="fixed-row" class:paused={r.paused || !!out} onclick={() => edit(r)}>
    <span class="fixed-main">
      <span class="fixed-name">{r.name}</span>
      <span class="fixed-sub">
        {#if r.kind === "transfer"}Transferencia · {/if}{freqLabel(r)}{#if r.auto_create} · <Icon name="repeat" /> registro automático{/if}{#if r.saving} · reserva mensual{/if}{#if r.paused} · en pausa{/if}{#if out} · {out}{/if}
      </span>
    </span>
    {#if r.category}<CategoryPill id={r.category} />{/if}
    <span class="fixed-amount">
      <Money value={r.amount} tone={r.kind} />
      {#if r.frequency === "yearly"}<span class="small muted"><Money value={monthlyEquivalent(r)} />/mes</span>{/if}
    </span>
  </button>
{/snippet}

<RecurringForm open={formOpen} item={editing} kind={newKind} onClose={() => (formOpen = false)} />

<style>
  .plan-section {
    margin: var(--sp-16) 0 0;

    & h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  }

  .plan-card {
    padding: var(--sp-20);
  }

  /* Las bandas son un SVG que se estira a lo ancho; las etiquetas, HTML
     encima, para que la letra no se deforme. Como en MoneyFlow. */
  .pflow {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 3fr) minmax(0, 1.4fr);
    gap: var(--sp-12);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1.3fr);
      gap: var(--sp-6);
    }

    & svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .pflow-labels {
    position: relative;

    &.left .pflow-label {
      right: 0;
      align-items: flex-end;
      text-align: right;
    }

    &.right .pflow-label {
      left: 0;
    }
  }

  .pflow-label {
    --ink: light-dark(oklch(from var(--seg) calc(l - 0.14) c h), var(--seg));

    position: absolute;
    display: flex;
    flex-direction: column;
    max-width: 100%;
    transform: translateY(-50%);

    &.main .pflow-amount {
      font-size: 1.625rem;
      line-height: 1.15;
    }
  }

  .pflow-name {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .pflow-amount {
    font-family: var(--font-num);
    font-size: 1.125rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .pflow-labels.right :is(.pflow-name, .pflow-amount :global(.money)),
  .pflow-sub {
    color: var(--ink);
  }

  .pflow-sub {
    font-size: var(--text-xs);
  }

  .pflow-income {
    fill: var(--text-muted);
  }

  .pflow-node {
    fill: var(--seg);
  }

  .pflow-band {
    fill: var(--seg);
    opacity: 0.28;
  }

  .seg-fixed {
    --seg: var(--viz-expense);
  }

  .seg-save {
    --seg: var(--viz-saving);
  }

  .seg-free {
    --seg: var(--viz-free);
  }

  .seg-short {
    --seg: var(--viz-expense);

    &.pflow-band {
      opacity: 0.14;
    }
  }

  .fixed-row {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-8) var(--sp-4);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    & + .fixed-row {
      border-top: var(--border-width) solid var(--border);
    }

    &:hover {
      background: var(--bg-hover);
    }

    &.paused {
      opacity: 0.5;
    }
  }

  .fixed-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .fixed-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .fixed-sub {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .fixed-amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-weight: 600;
  }

</style>
