<!--
  Las dos respuestas del mes, en grande. Sin `spent`, el plan: cuánto hay que
  reservar para los pagos programados y los ahorros, y cuánto queda para
  gastar (en Gastos e ingresos). Con `spent`, lo registrado: en qué se fue el
  dinero del mes y cuánto queda de lo disponible para gastar (en el Resumen).
-->
<script lang="ts" module>
  /** Lo registrado en el mes, por tipo de gasto. */
  export type Spent = { fixed: number; variable: number; card: number; savings: number };
</script>

<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "./Money.svelte";
  import { monthLabel } from "../../lib/format";
  import { store } from "../../lib/store.svelte";

  let { ym, spent }: { ym: string; spent?: Spent } = $props();

  const plan = $derived(store.planFor(ym));
  const month = $derived(monthLabel(ym, true).split(" ")[0]);
  const reserve = $derived(plan.fixed + plan.savings);
  const free = $derived(plan.free);
  const remaining = $derived(Math.max(0, free));
  const short = $derived(free < 0);
  const hasSavings = $derived(plan.savings > 0);
  const pct = (n: number) => (plan.income > 0 ? Math.round(Math.max(0, (n / plan.income) * 100)) : 0);
  // La barra muestra qué parte de los ingresos va a cada cosa. Si lo
  // reservado supera los ingresos, se llena con lo reservado para no desbordarse.
  const base = $derived(Math.max(plan.income, reserve));
  const width = (n: number) => (base > 0 ? (Math.max(0, n) / base) * 100 : 0);
  const share = (n: number) => (plan.income > 0 ? `${n}%` : "—");

  // Lo registrado: el total de gastos del mes y, de lo disponible para
  // gastar, cuánto ya se fue en gastos variables y con tarjeta.
  const total = $derived(spent ? spent.fixed + spent.variable + spent.card + spent.savings : 0);
  // La barra se mide contra el total de gastos: muestra solo cómo se reparte.
  const spentWidth = (n: number) => (total > 0 ? (Math.max(0, n) / total) * 100 : 0);
  const used = $derived(spent ? spent.variable + spent.card : 0);
  const left = $derived(free - used);
  const over = $derived(left < 0);
  const ofFree = (n: number) => (free > 0 ? `${Math.round(Math.max(0, (n / free) * 100))}%` : "—");
  const freeBase = $derived(Math.max(free, used));
  const freeWidth = (n: number) => (freeBase > 0 ? (Math.max(0, n) / freeBase) * 100 : 0);
</script>

<div class="pc">
{#if spent}
  <section class="card pc-card pc-reserve split">
    <div class="pc-top">
      <span class="pc-ico"><Icon name="money-send-01" size={20} /></span>
      <span class="pc-label">Gastos de {month}</span>
    </div>
    <Money value={total} />
    <p class="pc-text">Tus gastos del mes, en porcentaje de tus ingresos.</p>
    <div class="pc-split">
      <div
        class="pc-meter pc-meter-split"
        role="img"
        aria-label={plan.income > 0
          ? `De tus ingresos, ${pct(spent.fixed)}% se fue en gastos fijos, ${pct(spent.variable)}% en gastos variables, ${pct(spent.savings)}% en ahorros y ${pct(spent.card)}% con tarjeta de crédito.`
          : "Aún no hay ingresos programados este mes."}
      >
        <span class="is-fixed" style:width="{spentWidth(spent.fixed)}%"></span>
        <span class="is-variable" style:width="{spentWidth(spent.variable)}%"></span>
        <span class="is-saving" style:width="{spentWidth(spent.savings)}%"></span>
        <span class="is-card" style:width="{spentWidth(spent.card)}%"></span>
      </div>
    </div>
    <dl class="pc-parts pc-reserve-parts pc-four">
      <div class="part-fixed">
        <dt>Fijos</dt>
        <dd><Money value={spent.fixed} /><span class="pc-pct">{share(pct(spent.fixed))}</span></dd>
      </div>
      <div class="part-variable">
        <dt>Variables</dt>
        <dd><Money value={spent.variable} /><span class="pc-pct">{share(pct(spent.variable))}</span></dd>
      </div>
      <div class="part-saving">
        <dt>Ahorros</dt>
        <dd><Money value={spent.savings} /><span class="pc-pct">{share(pct(spent.savings))}</span></dd>
      </div>
      <div class="part-card">
        <dt>Tarjetas de crédito</dt>
        <dd><Money value={spent.card} /><span class="pc-pct">{share(pct(spent.card))}</span></dd>
      </div>
    </dl>
  </section>

  <section class="card pc-card pc-free" class:short={over}>
    <div class="pc-top">
      <span class="pc-ico"><Icon name={over ? "alert-circle" : "wallet-01"} size={20} /></span>
      <span class="pc-label">{over ? `Gastaste de más en ${month}` : `Disponible para el mes de ${month}`}</span>
    </div>
    <Money value={Math.abs(left)} />
    <p class="pc-text">
      {#if free <= 0}
        Aún no hay dinero disponible para gastar en {month}. Programa tus ingresos o reduce los pagos y ahorros.
      {:else if over}
        Tus gastos variables y con tarjeta superan lo disponible del mes. Reduce gastos para cubrir la diferencia.
      {:else}
        Lo que queda después de tus gastos variables y con tarjeta.
      {/if}
    </p>
    <div
      class="pc-meter pc-meter-split pc-left-meter"
      role="img"
      aria-label={free > 0 ? `Ya gastaste el ${ofFree(used)} de lo disponible y te queda el ${ofFree(left)}.` : "Aún no hay dinero disponible este mes."}
    >
      <span class="is-used" style:width="{freeWidth(used)}%"></span>
      <span class="is-free" style:width="{freeWidth(left)}%"></span>
    </div>
    <dl class="pc-parts pc-reserve-parts pc-left-parts">
      <div class="part-available">
        <dt>Disponible del mes</dt>
        <dd><Money value={free} /><span class="pc-pct">{free > 0 ? "100%" : "—"}</span></dd>
      </div>
      <div class="part-used">
        <dt>Ya gastado</dt>
        <dd><Money value={used} /><span class="pc-pct">{ofFree(used)}</span></dd>
      </div>
      <div class="part-left">
        <dt>{over ? "Gastado de más" : "Te queda"}</dt>
        <dd><Money value={Math.abs(left)} /><span class="pc-pct">{over ? "—" : ofFree(left)}</span></dd>
      </div>
    </dl>
  </section>
{:else}
  <section class="card pc-card pc-reserve" class:split={hasSavings}>
    <div class="pc-top">
      <span class="pc-ico"><Icon name="coins-01" size={20} /></span>
      <span class="pc-label">Dinero por reservar en {month}</span>
    </div>
    <Money value={reserve} />
    <p class="pc-text">Reserva este monto de tus ingresos para pagos programados y ahorros.</p>
    <div class="pc-split">
      <div
        class="pc-meter pc-meter-split"
        role="img"
        aria-label={plan.income > 0
          ? `De tus ingresos, ${pct(plan.fixed)}% es para pagos programados, ${pct(plan.savings)}% para ahorros y ${pct(remaining)}% queda disponible.`
          : "Aún no hay ingresos programados este mes."}
      >
        <span class="is-fixed" style:width="{width(plan.fixed)}%"></span>
        {#if hasSavings}<span class="is-saving" style:width="{width(plan.savings)}%"></span>{/if}
        <span class="is-free" style:width="{width(remaining)}%"></span>
      </div>
    </div>
    <dl class="pc-parts pc-reserve-parts">
      <div class="part-fixed">
        <dt>Pagos programados</dt>
        <dd><Money value={plan.fixed} /><span class="pc-pct">{share(pct(plan.fixed))}</span></dd>
      </div>
      <div class="part-saving">
        <dt>Ahorros</dt>
        <dd><Money value={plan.savings} /><span class="pc-pct">{share(pct(plan.savings))}</span></dd>
      </div>
      <div class="part-total">
        <dt>Total</dt>
        <dd><Money value={reserve} /><span class="pc-pct">{share(pct(reserve))}</span></dd>
      </div>
    </dl>
  </section>

  <section class="card pc-card pc-free" class:short>
    <div class="pc-top">
      <span class="pc-ico"><Icon name={short ? "alert-circle" : "wallet-01"} size={20} /></span>
      <span class="pc-label">{short ? `Dinero faltante en ${month}` : `Disponible para gastar en ${month}`}</span>
    </div>
    <Money value={Math.abs(free)} />
    <p class="pc-text">
      {#if plan.income <= 0}
        Aún no hay ingresos programados en {month}. Programa un ingreso para saber cuánto te queda.
      {:else if short}
        Tus pagos y ahorros superan tus ingresos del mes. Reduce un gasto o un ahorro para cubrir la diferencia.
      {:else}
        Tus ingresos después de reservar pagos programados y ahorros.
      {/if}
    </p>
    <div class="pc-meter pc-meter-split pc-available-meter" aria-hidden="true">
      <span class="is-fixed" style:width="{width(plan.fixed)}%"></span>
      <span class="is-saving" style:width="{width(plan.savings)}%"></span>
      <span class="is-free" style:width="{width(remaining)}%"></span>
    </div>
    <dl class="pc-parts pc-free-parts">
      <div>
        <dt>Ingresos</dt>
        <dd><Money value={plan.income} /></dd>
      </div>
      <div>
        <dt>Disponible</dt>
        <dd>{short ? "—" : share(pct(free))}</dd>
      </div>
    </dl>
  </section>
{/if}
</div>

<style>
  .pc {
    /* Los gastos variables, en amarillo. */
    --viz-variable: light-dark(oklch(0.8 0.14 90), oklch(0.86 0.13 92));

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: var(--card-gap, var(--sp-16));
  }

  /* Cada tarjeta con su color: un brillo en la esquina y el borde teñido. */
  .pc-card {
    --tone: var(--viz-saving);

    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    overflow: hidden;
    padding: var(--sp-20);
    border-color: oklch(from var(--tone) l c h / 0.35);
    background:
      radial-gradient(120% 120% at 100% 0%, oklch(from var(--tone) l c h / 0.24), transparent 55%), var(--glass-sheen, none),
      var(--glass-1, var(--bg-level1));

    & > :global(.money) {
      font-family: var(--font-num);
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
  }

  .pc-reserve {
    --tone: var(--viz-expense);

    /* Con ahorros, dos brillos en las esquinas de arriba: rojo de los gastos
       a la izquierda y azul de los ahorros a la derecha, como en la barra. */
    &.split {
      border-color: color-mix(in oklch, oklch(from var(--viz-expense) l c h / 0.35), oklch(from var(--viz-saving) l c h / 0.35));
      background:
        radial-gradient(120% 120% at 0% 0%, oklch(from var(--viz-expense) l c h / 0.24), transparent 55%),
        radial-gradient(120% 120% at 100% 0%, oklch(from var(--viz-saving) l c h / 0.24), transparent 55%), var(--glass-sheen, none),
        var(--glass-1, var(--bg-level1));

      & .pc-ico {
        background: linear-gradient(135deg, oklch(from var(--viz-expense) l c h / 0.22), oklch(from var(--viz-saving) l c h / 0.22));
      }

      & .pc-parts dt::before {
        content: "";
        display: inline-block;
        width: 0.5rem;
        height: 0.5rem;
        margin-right: 0.3rem;
        border-radius: 50%;
        background: var(--dot, transparent);
        vertical-align: 0.05em;
      }

      & .pc-parts .part-fixed {
        --dot: var(--viz-expense);
      }

      & .pc-parts .part-saving {
        --dot: var(--viz-saving);
      }

      & .pc-parts .part-variable {
        --dot: var(--viz-variable);
      }

      & .pc-parts .part-card {
        --dot: var(--viz-card);
      }
    }
  }

  .pc-split {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-top: var(--sp-4);

    & .pc-meter {
      margin-top: 0;
    }
  }

  .pc-meter.pc-meter-split {
    display: flex;
    height: 0.5rem;

    & span {
      flex: none;
      border-radius: 0;
    }

    & .is-fixed {
      background: var(--viz-expense);
    }

    & .is-saving {
      background: var(--viz-saving);
    }

    & .is-variable {
      background: var(--viz-variable);
    }

    & .is-card {
      background: var(--viz-card);
    }

    & .is-used {
      background: var(--viz-expense);
    }

    & .is-free {
      background: var(--viz-free);
    }

  }

  .pc-reserve .pc-meter-split .is-free {
    opacity: 0.2;
  }

  .pc-available-meter :is(.is-fixed, .is-saving) {
    opacity: 0.2;
  }

  .pc-free {
    --tone: var(--viz-free);

    &.short {
      --tone: var(--viz-expense);

      & > :global(.money) {
        color: var(--danger, var(--viz-expense));
      }
    }
  }

  .pc-top {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
  }

  .pc-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: oklch(from var(--tone) l c h / 0.18);
    color: light-dark(oklch(from var(--tone) calc(l - 0.12) c h), var(--tone));
  }

  .pc-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .pc-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.45;
  }

  .pc-meter {
    height: 0.375rem;
    margin-top: var(--sp-4);
    overflow: hidden;
    border-radius: var(--radius-pill, 99px);
    background: var(--field-bg, var(--bg-hover));

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--tone);
    }
  }

  .pc-parts.pc-reserve-parts {
    grid-template-columns: repeat(3, minmax(0, 1fr));

    & .part-total dt::before {
      display: none;
    }

    @media (max-width: 40rem) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-12);

      & div + div {
        padding-left: 0;
        border-left: 0;
      }
    }
  }

  /* Los cuatro tipos de gasto: en dos filas cuando no caben. */
  .pc-parts.pc-reserve-parts.pc-four {
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    row-gap: var(--sp-10);
  }

  .pc-parts.pc-free-parts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    @media (max-width: 40rem) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-12);
      & div + div {
        padding-left: 0;
        border-left: 0;
      }
    }
  }

  .pc-reserve-parts dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-4) var(--sp-6);
    overflow: visible;
    white-space: normal;
  }

  .pc-pct {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 400;
    white-space: nowrap;
  }

  .pc-parts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-8);
    margin: var(--sp-4) 0 0;

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    & dt {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    & dd {
      overflow: hidden;
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  /* En el teléfono, más compactas: el icono a la izquierda del título y del
     monto, y el resto debajo a lo ancho. Se ve todo, en menos alto. */
  @media (max-width: 40rem) {
    .pc {
      gap: var(--sp-12);
    }

    .pc-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        "ico label"
        "ico money"
        "text text"
        "meter meter"
        "parts parts";
      column-gap: var(--sp-12);
      row-gap: 0;
      padding: var(--sp-16);

      & > :global(.money) {
        grid-area: money;
        font-size: 1.625rem;
      }
    }

    .pc-top {
      display: contents;
    }

    .pc-ico {
      grid-area: ico;
      align-self: center;
      width: 2.75rem;
      height: 2.75rem;
    }

    .pc-label {
      grid-area: label;
      align-self: end;
      font-size: var(--text-xs);
    }

    .pc-text {
      grid-area: text;
      margin-top: var(--sp-10);
      font-size: var(--text-xs);
      line-height: 1.4;
    }

    .pc-meter,
    .pc-split {
      grid-area: meter;
      margin-top: var(--sp-10);
    }

    .pc-split .pc-meter {
      margin-top: 0;
    }

    /* Las tres cifras en una franja, separadas por una raya. */
    .pc-parts {
      grid-area: parts;
      gap: 0;
      margin-top: var(--sp-10);

      & div + div {
        padding-left: var(--sp-10);
        border-left: 1px solid var(--border);
      }
    }
  }
</style>
