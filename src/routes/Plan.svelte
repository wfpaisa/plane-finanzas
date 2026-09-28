<!--
  Proyección: el plan del mes (ingresos, fijos, ahorros y lo que se puede
  gastar), los próximos meses y un simulador del balance total.
-->
<script lang="ts">
  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import MoneyInput from "../components/app/MoneyInput.svelte";
  import RecurringForm from "../components/app/RecurringForm.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Field } from "../components/ui";
  import Tag from "../components/ui/Tag.svelte";
  import { band, flowLayout } from "../lib/analysis";
  import { activeIn, monthlyEquivalent, simulate, today, whenTotalReaches, type Kind } from "../lib/finance";
  import { monthLabel, monthName, monthsLabel } from "../lib/format";
  import { simulationChart } from "../lib/planCharts";
  import { store } from "../lib/store.svelte";
  import type { Recurring } from "../lib/types";

  const ym = today().slice(0, 7);

  let formOpen = $state(false);
  let editing = $state<Recurring | null>(null);
  let newKind = $state<Kind>("expense");

  let months = $state(24);
  let spendPct = $state(100);
  let extra = $state(0);
  let baseRate = $state(0);
  let goal = $state(0);

  const plan = $derived(store.plan);
  const incomes = $derived(store.recurring.filter((r) => r.kind === "income"));
  const expenses = $derived(store.recurring.filter((r) => r.kind === "expense"));

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
        { id: "fixed", label: "Gastos frecuentes", value: plan.fixed, tint: "seg-fixed" },
        { id: "save", label: "Ahorros", value: plan.savings, tint: "seg-save" },
        plan.free < 0
          ? { id: "short", label: "Te falta cada mes", value: -plan.free, tint: "seg-short" }
          : { id: "free", label: "Te puedes gastar", value: plan.free, tint: "seg-free" },
      ].filter((p) => p.value > 0),
      FLOW_H,
      8,
      60,
    ),
  );
  const inH = $derived(flow.total ? (FLOW_H * Math.min(plan.income, flow.total)) / flow.total : 0);

  // Los ahorros como los ve la simulación: lo que tienen en las cuentas
  // propias y la parte del aporte que sale de ellas. En uno compartido, lo
  // que ponen los demás no es plata de uno.
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

  function edit(r: Recurring | null, kind: Kind = "expense") {
    editing = r;
    newKind = kind;
    formOpen = true;
  }

  const freqLabel = (r: Recurring) =>
    r.frequency === "yearly"
      ? `Anual · ${monthName(r.month || 1)}`
      : r.frequency === "once"
        ? `Una vez · ${r.start_date?.slice(0, 10) ?? ""}`
        : `Día ${r.day_of_month || 1}`;

  /** Por qué un fijo no suma en el plan de este mes: ya terminó o aún no empieza. */
  const outOfPlan = (r: Recurring) => {
    if (r.paused || r.frequency === "once" || activeIn(r, ym)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < ym ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };

  const simConfig = () => simulationChart(sim, simSavings, store.total);
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Proyección</h1>
      <p>Calcula cuánto puedes gastar al mes y cómo cambiaría tu dinero con el tiempo.</p>
    </div>
    <div class="page-actions">
      <Button onclick={() => edit(null, "income")}><Icon name="money-receive-01" />Ingreso recurrente</Button>
      <Button variant="secondary" onclick={() => edit(null, "expense")}><Icon name="add-01" />Gasto recurrente</Button>
    </div>
  </header>

  <div class="stack">
    <!-- El ingreso a la izquierda se abre en bandas hacia lo que se lleva
         cada parte, cada una del grueso de su monto. Lo que queda para
         gastar es la respuesta, y va más grande. -->
    <div class="card plan-card">
      {#if plan.income > 0}
        <div class="pflow" style:height="{FLOW_H}px">
          <div class="pflow-labels left">
            <div class="pflow-label" style:top="{(Math.min(inH, FLOW_H) / 2 / FLOW_H) * 100}%">
              <span class="pflow-name">Tu ingreso al mes</span>
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
                {#if n.id === "short"}<span class="pflow-sub">lo planeado supera tu ingreso</span>{/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="muted small">Agrega tus ingresos recurrentes para ver en qué se va cada peso.</p>
      {/if}
    </div>

    <div class="split-even">
      <div class="card">
        <div class="card-head">
          <div><h3 class="card-title">Ingresos recurrentes</h3><p class="card-sub">Dinero que esperas recibir: <Money value={plan.income} /> al mes</p></div>
          <div class="card-head-actions"><button type="button" class="btn-icon sm" aria-label="Agregar ingreso recurrente" onclick={() => edit(null, "income")}><Icon name="add-01" /></button></div>
        </div>
        <div class="card-body">
          {#each incomes as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">Agrega tu sueldo u otros ingresos.</div>
          {/each}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div><h3 class="card-title">Gastos recurrentes</h3><p class="card-sub">Pagos que esperas repetir: <Money value={plan.fixed} /> al mes</p></div>
          <div class="card-head-actions"><button type="button" class="btn-icon sm" aria-label="Agregar gasto recurrente" onclick={() => edit(null, "expense")}><Icon name="add-01" /></button></div>
        </div>
        <div class="card-body">
          {#each expenses as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">Crédito, servicios, administración…</div>
          {/each}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Simulador</h3>
          <p class="card-sub">Hoy tienes <Money value={store.total} /> en total.</p>
        </div>
      </div>
      <div class="card-body stack">
        <div class="sim-controls">
          <label class="sim-control">
            <span>Tiempo que quieres calcular: <b>{monthsLabel(months)}</b></span>
            <input type="range" class="field-control" min="1" max="120" bind:value={months} />
          </label>
          <label class="sim-control">
            <span>Gastarías el <b>{spendPct}%</b> del dinero disponible</span>
            <input type="range" class="field-control" min="0" max="100" step="5" bind:value={spendPct} />
          </label>
          <Field label="Cambio adicional cada mes" hint="Usa un valor positivo para dinero extra que recibirías y uno negativo para un gasto adicional."><MoneyInput bind:value={extra} allowNegative /></Field>
          <Field label="Interés anual del dinero no reservado (%)" hint="Porcentaje que esperas ganar en un año. Escribe 0 si ese dinero no genera intereses."><input type="number" class="field-control w-full" min="0" max="50" step="0.5" bind:value={baseRate} /></Field>
        </div>

        {#if last}
          <div class="sim-answer">
            <div>
              <span class="muted small">Total estimado para {monthLabel(last.month, true)}</span>
              <Money value={last.total} class="big" />
            </div>
            <div>
              <span class="muted small">de eso, en ahorros</span>
              <Money value={last.savingsTotal} class="mid" />
            </div>
            <div>
              <span class="muted small">cambio frente a hoy</span>
              <Money value={last.total - store.total} tone="auto" class="mid" />
            </div>
          </div>
        {/if}

        <Chart config={simConfig} height={320} label="Cálculo del saldo neto a futuro" />

        <div class="goal">
          <Field label="¿Para cuándo tendría…?"><MoneyInput bind:value={goal} placeholder="200.000.000" /></Field>
          <div class="goal-answer">
            {#if !goal}
              <span class="muted">Escribe una cifra y te digo la fecha.</span>
            {:else if goal <= store.total}
              <Tag tone="tag-success">¡Ya la tienes! 🎉</Tag>
            {:else if reach}
              <span>Llegarías en <b>{monthLabel(reach.month, true)}</b> ({monthsLabel(reachIn)}).</span>
            {:else}
              <span class="muted">El objetivo no se alcanzaría en 50 años con estos valores. Reduce los gastos o aumenta los aportes.</span>
            {/if}
          </div>
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
        {freqLabel(r)}{#if r.auto_create} · <Icon name="repeat" /> automático{/if}{#if r.paused} · pausado{/if}{#if out} · {out}{/if}
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

  .sim-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: var(--sp-16);
    align-items: end;
  }

  .sim-control {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    font-size: var(--text-sm);
  }

  .sim-answer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-12) var(--sp-40);
    padding: var(--sp-16);
    border-radius: var(--radius-md);
    background: var(--bg-field);

    & > div {
      display: flex;
      flex-direction: column;
    }

    & :global(.big) {
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    & :global(.mid) {
      font-size: 1.25rem;
      font-weight: 700;
    }
  }

  .goal {
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) 1fr;
    align-items: end;
    gap: var(--sp-16);

    @media (max-width: 40rem) {
      grid-template-columns: 1fr;
    }
  }

  .goal-answer {
    padding-bottom: var(--sp-8);
    font-size: var(--text-sm);
  }
</style>
