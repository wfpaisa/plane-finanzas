<!--
  Las dos respuestas del mes, en grande: cuánto hay que reservar para los
  pagos programados, los ahorros y lo que se debe en tarjetas de crédito, y
  cuánto queda para gastar. Siguen al mes que se ve en la lista del mes.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "./Money.svelte";
  import type { CardPlan } from "../../lib/cards";
  import { today } from "../../lib/finance";
  import { monthLabel } from "../../lib/format";
  import { store } from "../../lib/store.svelte";

  let { ym, cards }: { ym: string; cards: CardPlan } = $props();

  const plan = $derived(store.planFor(ym));
  const month = $derived(monthLabel(ym, true).split(" ")[0]);
  const past = $derived(ym < today().slice(0, 7));
  const reserve = $derived(plan.fixed + plan.savings + cards.total);
  /** Lo que queda después de reservar todo, tarjetas incluidas. */
  const free = $derived(plan.free - cards.total);
  const remaining = $derived(Math.max(0, free));
  const short = $derived(free < 0);
  const hasCards = $derived(cards.total > 0);
  const hasSavings = $derived(plan.savings > 0);
  const pct = (n: number) => (plan.income > 0 ? Math.round(Math.max(0, (n / plan.income) * 100)) : 0);
  // La barra muestra qué parte de los ingresos va a cada cosa. Si lo
  // reservado supera los ingresos, se llena con lo reservado para no desbordarse.
  const base = $derived(Math.max(plan.income, reserve));
  const width = (n: number) => (base > 0 ? (Math.max(0, n) / base) * 100 : 0);
  const share = (n: number) => (plan.income > 0 ? `${n}%` : "—");
  const cardLabel = $derived(past ? "Gastos con tarjeta" : "Tarjetas de crédito");
</script>

<div class="pc">
  <section class="card pc-card pc-reserve" class:split={hasSavings || hasCards}>
    <div class="pc-top">
      <span class="pc-ico"><Icon name="coins-01" size={20} /></span>
      <span class="pc-label">Dinero por reservar en {month}</span>
    </div>
    <Money value={reserve} />
    {#if hasCards}
      <p class="pc-secondary">Pagos programados + ahorros: <Money value={plan.fixed + plan.savings} /></p>
    {/if}
    <p class="pc-text">
      {hasCards
        ? "Reserva este monto de tus ingresos para pagos programados, ahorros y gastos con tarjeta de crédito."
        : "Reserva este monto de tus ingresos para pagos programados y ahorros."}
    </p>
    <div class="pc-split">
      <div
        class="pc-meter pc-meter-split"
        role="img"
        aria-label={plan.income > 0
          ? `De tus ingresos, ${pct(plan.fixed)}% es para pagos programados, ${pct(cards.total)}% para tarjetas de crédito, ${pct(plan.savings)}% para ahorros y ${pct(remaining)}% queda disponible.`
          : "Aún no hay ingresos programados este mes."}
      >
        <span class="is-fixed" style:width="{width(plan.fixed)}%"></span>
        {#if hasCards}<span class="is-card" style:width="{width(cards.total)}%"></span>{/if}
        {#if hasSavings}<span class="is-saving" style:width="{width(plan.savings)}%"></span>{/if}
        <span class="is-free" style:width="{width(remaining)}%"></span>
      </div>
    </div>
    <dl class="pc-parts pc-reserve-parts" class:without-card={!hasCards}>
      <div class="part-fixed">
        <dt>Pagos programados</dt>
        <dd><Money value={plan.fixed} /><span class="pc-pct">{share(pct(plan.fixed))}</span></dd>
      </div>
      {#if hasCards}
        <div class="part-card">
          <dt>{cardLabel}</dt>
          <dd><Money value={cards.total} /><span class="pc-pct">{share(pct(cards.total))}</span></dd>
        </div>
      {/if}
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
    {#if hasCards}
      <p class="pc-secondary">Sin contar las tarjetas: <Money value={plan.free} /></p>
    {/if}
    <p class="pc-text">
      {#if plan.income <= 0}
        Aún no hay ingresos programados en {month}. Programa un ingreso para saber cuánto te queda.
      {:else if short}
        {hasCards ? "Tus pagos, ahorros y tarjetas" : "Tus pagos y ahorros"} superan tus ingresos del mes. Reduce un gasto o un ahorro para cubrir la
        diferencia.
      {:else if hasCards}
        Tus ingresos después de reservar pagos programados, ahorros y gastos con tarjeta de crédito. Pagar la tarjeta no cambia este monto.
      {:else}
        Tus ingresos después de reservar pagos programados y ahorros.
      {/if}
    </p>
    <div class="pc-meter pc-meter-split pc-available-meter" aria-hidden="true">
      <span class="is-fixed" style:width="{width(plan.fixed)}%"></span>
      {#if hasCards}<span class="is-card" style:width="{width(cards.total)}%"></span>{/if}
      <span class="is-saving" style:width="{width(plan.savings)}%"></span>
      <span class="is-free" style:width="{width(remaining)}%"></span>
    </div>
    <dl class="pc-parts pc-free-parts" style:--parts={2 + Number(hasCards)}>
      <div>
        <dt>Ingresos</dt>
        <dd><Money value={plan.income} /></dd>
      </div>
      {#if hasCards}
        <div>
          <dt>Sin contar tarjetas</dt>
          <dd>{plan.free < 0 ? "—" : share(pct(plan.free))}</dd>
        </div>
      {/if}
      <div>
        <dt>Total</dt>
        <dd>{short ? "—" : share(pct(free))}</dd>
      </div>
    </dl>
  </section>
</div>

<style>
  .pc {
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

      & .pc-parts .part-card {
        --dot: var(--viz-card);
      }

      & .pc-parts .part-saving {
        --dot: var(--viz-saving);
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

    & .is-card {
      background: var(--viz-card);
    }

    & .is-saving {
      background: var(--viz-saving);
    }

    & .is-free {
      background: var(--viz-free);
    }

  }

  .pc-reserve .pc-meter-split .is-free {
    opacity: 0.2;
  }

  .pc-available-meter :is(.is-fixed, .is-card, .is-saving) {
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

  .pc-secondary {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);

    & :global(.money) {
      font-size: var(--text-sm);
      font-weight: 600;
    }
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
    grid-template-columns: repeat(4, minmax(0, 1fr));

    &.without-card {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

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

  .pc-parts.pc-free-parts {
    grid-template-columns: repeat(var(--parts), minmax(0, 1fr));
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
        "secondary secondary"
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

    .pc-secondary {
      grid-area: secondary;
      margin-top: var(--sp-6);
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
