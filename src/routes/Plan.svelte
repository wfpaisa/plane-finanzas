<!--
  Proyección: el plan del mes (ingresos, fijos, ahorros y lo que se puede
  gastar), los próximos meses y un simulador del balance total.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import ColorDot from "../components/app/ColorDot.svelte";
  import MoneyInput from "../components/app/MoneyInput.svelte";
  import RecurringForm from "../components/app/RecurringForm.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Field } from "../components/ui";
  import Tag from "../components/ui/Tag.svelte";
  import { alpha, colorsFor, token } from "../lib/colors";
  import { activeIn, addMonths, monthlyEquivalent, occursIn, simulate, today, whenTotalReaches, type Kind } from "../lib/finance";
  import { money, monthLabel, monthName, monthsLabel } from "../lib/format";
  import { colorOf } from "../lib/palettes";
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

  // La barra se mide contra el ingreso o, si lo planeado se pasa, contra lo
  // planeado: así los tramos nunca suman más del ancho.
  const barBase = $derived(Math.max(plan.income, plan.fixed + plan.savings));
  const share = (n: number) => (plan.income > 0 ? Math.max(0, (n / plan.income) * 100) : 0);
  const width = (n: number) => (barBase > 0 ? Math.max(0, (n / barBase) * 100) : 0);

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

  /** $2,5 M · $800 mil: para los ejes, donde el número entero no cabe. */
  const short = (n: number) => {
    const a = Math.abs(n);
    const sign = n < 0 ? "−" : "";
    if (a >= 1e6) return `${sign}$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
    if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)} mil`;
    return money(n);
  };

  /*
   * Cada columna es el ingreso del mes repartido: gastos frecuentes, ahorros y
   * lo que queda libre, uno encima del otro y sin redondear, para que se lea
   * como un solo bloque. La línea punteada marca el ingreso: si la columna la
   * pasa, ese mes lo planeado no alcanza.
   */
  const nextConfig = (): ChartConfiguration => {
    const labels: string[] = [];
    const fixed: number[] = [];
    const saving: number[] = [];
    const free: number[] = [];
    const income: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const m = addMonths(ym, i);
      labels.push(monthLabel(m));
      let inc = 0;
      let exp = 0;
      for (const r of store.recurring) {
        const v = occursIn(r, m);
        if (r.kind === "income") inc += v;
        else exp += v;
      }
      income.push(inc);
      fixed.push(exp);
      saving.push(plan.savings);
      free.push(Math.max(0, inc - exp - plan.savings));
    }
    const paper = token("--bg-level2");
    const bar = (label: string, data: number[], color: string) => ({
      type: "bar" as const,
      label,
      data,
      backgroundColor: color,
      hoverBackgroundColor: color,
      // Una raya del color de la tarjeta entre tramos, para que se distingan.
      borderColor: paper,
      borderWidth: { top: 1.5 },
      stack: "s",
      barPercentage: 0.72,
      categoryPercentage: 0.86,
    });
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          bar("Gastos frecuentes", fixed, token("--viz-expense")),
          bar("Ahorros", saving, token("--viz-saving")),
          bar("Disponible", free, token("--viz-free")),
          {
            type: "line",
            label: "Ingresos",
            data: income,
            borderColor: token("--viz-income"),
            backgroundColor: token("--viz-income"),
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            stepped: "middle",
            order: -1,
          },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { maxTicksLimit: 5, callback: (v) => short(Number(v)) },
            border: { display: false },
          },
        },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "rectRounded", boxHeight: 8, padding: 16 } },
          tooltip: {
            filter: (item) => item.dataset.type !== "line",
            itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
            callbacks: {
              label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}`,
              footer: (items) => {
                const i = items[0]?.dataIndex ?? 0;
                const lack = fixed[i] + saving[i] - income[i];
                return lack > 0 ? [`Ingresos: ${money(income[i])}`, `Faltan: ${money(lack)}`] : [`Ingresos: ${money(income[i])}`];
              },
            },
          },
        },
      },
    } as ChartConfiguration;
  };

  const simConfig = (): ChartConfiguration => {
    const labels = ["Hoy", ...sim.map((r) => monthLabel(r.month))];
    // Cada ahorro en su color.
    const colors = colorsFor(simSavings.map((s) => colorOf(s.palette)));
    const pots = simSavings.map((s, i) => {
      const color = colors[i];
      return {
        type: "line" as const,
        label: s.name,
        data: [s.current, ...sim.map((r) => r.perSaving[s.id] ?? 0)],
        borderColor: color,
        backgroundColor: alpha(color, 0.5),
        borderWidth: 1,
        pointRadius: 0,
        fill: i === 0 ? "origin" : "-1",
        stack: "pots",
        tension: 0.2,
      };
    });
    return {
      type: "line",
      data: {
        labels,
        datasets: [
          ...pots,
          {
            label: "Dinero total",
            data: [store.total, ...sim.map((r) => r.total)],
            borderColor: token("--viz-line"),
            backgroundColor: token("--viz-line"),
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: false,
            stack: "total",
          },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { stacked: true, ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
        },
      },
    } as ChartConfiguration;
  };
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Plan futuro</h1>
      <p>Calcula cuánto puedes gastar al mes y cómo cambiaría tu dinero con el tiempo.</p>
    </div>
    <div class="page-actions">
      <Button onclick={() => edit(null, "income")}><Icon name="money-receive-01" />Ingreso frecuente</Button>
      <Button variant="secondary" onclick={() => edit(null, "expense")}><Icon name="add-01" />Gasto frecuente</Button>
    </div>
  </header>

  <div class="stack">
    <div class="card plan-card">
      <div class="plan-top">
        <div class="stat">
          <span class="s-label">Ingresos al mes</span>
          <span class="s-val"><Money value={plan.income} tone="income" /></span>
        </div>
        <span class="op">−</span>
        <div class="stat">
          <span class="s-label">Gastos frecuentes</span>
          <span class="s-val"><Money value={plan.fixed} tone="expense" /></span>
        </div>
        <span class="op">−</span>
        <div class="stat">
          <span class="s-label">Ahorros</span>
          <span class="s-val accent"><Money value={plan.savings} /></span>
        </div>
        <span class="op">=</span>
        <div class="stat free">
          <span class="s-label">Disponible para otros gastos</span>
          <span class="s-val"><Money value={plan.free} tone={plan.free < 0 ? "expense" : undefined} /></span>
        </div>
      </div>
      <div class="plan-bar" aria-hidden="true">
        <span class="seg-fixed" style:width="{width(plan.fixed)}%"></span>
        <span class="seg-save" style:width="{width(plan.savings)}%"></span>
        <span class="seg-free" style:width="{width(plan.free)}%"></span>
      </div>
      <div class="legend">
        <span class="legend-item"><span class="swatch seg-fixed"></span>Gastos frecuentes <b>{Math.round(share(plan.fixed))}%</b></span>
        <span class="legend-item"><span class="swatch seg-save"></span>Ahorros <b>{Math.round(share(plan.savings))}%</b></span>
        <span class="legend-item"><span class="swatch seg-free"></span>Disponible <b>{Math.round(share(plan.free))}%</b></span>
      </div>
    </div>

    <div class="split-even">
      <div class="card">
        <div class="card-head">
          <div><h3 class="card-title">Ingresos frecuentes</h3><p class="card-sub">Dinero que esperas recibir: <Money value={plan.income} /> al mes</p></div>
          <div class="card-head-actions"><button type="button" class="btn-icon sm" aria-label="Agregar ingreso fijo" onclick={() => edit(null, "income")}><Icon name="add-01" /></button></div>
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
          <div><h3 class="card-title">Gastos frecuentes</h3><p class="card-sub">Pagos que esperas repetir: <Money value={plan.fixed} /> al mes</p></div>
          <div class="card-head-actions"><button type="button" class="btn-icon sm" aria-label="Agregar gasto fijo" onclick={() => edit(null, "expense")}><Icon name="add-01" /></button></div>
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
          <h3 class="card-title">Ahorros del mes</h3>
          <p class="card-sub"><Money value={plan.savings} /> · <a class="link" href="#/ahorros">administrar</a></p>
        </div>
      </div>
      <div class="card-body savings-chips">
        {#each store.activeSavings as s (s.id)}
          <!-- En uno compartido, la parte propia: la que suma arriba. -->
          <a class="saving-chip" href="#/ahorros">
            <ColorDot color={s.palette} />{s.name}<Money value={(s.monthly_amount || 0) * store.savingShare(s)} />
          </a>
        {:else}
          <span class="muted">Sin ahorros.</span>
        {/each}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Próximos 12 meses</h3>
          <p class="card-sub">En qué se va el ingreso de cada mes según el plan. La línea punteada es el ingreso: si una columna la pasa, ese mes no alcanza.</p>
        </div>
      </div>
      <div class="card-body"><Chart config={nextConfig} height={280} square label="Plan de los próximos 12 meses" /></div>
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

        <Chart config={simConfig} height={320} label="Cálculo del dinero total a futuro" />

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
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
    padding: var(--sp-20);
  }

  .plan-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-12) var(--sp-20);

    & .stat .s-val {
      font-size: 1.375rem;
      font-family: var(--font-num);
      font-weight: 700;
    }

    & .accent {
      color: var(--text-primary);
    }

    & .free {
      margin-left: auto;
      padding: var(--sp-10) var(--sp-16);
      border-radius: var(--radius-md);
      background: var(--text-primary);
      color: var(--bg-level2);

      & .s-label {
        color: inherit;
        opacity: 0.7;
      }

      & .s-val {
        font-size: 1.75rem;
        color: inherit;
      }

      & :global(.money) {
        color: inherit;
      }
    }
  }

  .op {
    font-size: 1.5rem;
    color: var(--text-subtle);
    font-weight: 300;
  }

  .plan-bar {
    display: flex;
    height: 0.875rem;
    overflow: hidden;
    border-radius: 99rem;
    background: var(--bg-field);
    gap: 2px;

    & span {
      transition: width 0.4s;
    }
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

  .savings-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
  }

  .saving-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    padding: var(--sp-6) var(--sp-12);
    border-radius: 99rem;
    background: var(--bg-field);
    box-shadow: inset 0 0 0 1px var(--border);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;

    & :global(.money) {
      color: var(--text-secondary);
      font-weight: 500;
    }
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
