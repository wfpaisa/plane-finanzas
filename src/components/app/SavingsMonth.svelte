<!--
  Los aportes del mes: cuánto de lo que toca guardar este mes ya se registró
  y cuánto falta. Cada ahorro cuenta hasta su aporte: lo que se pone de más en
  uno no tapa lo que falta en otro. De un ahorro compartido, solo la parte propia.
-->
<script lang="ts">
  import Money from "./Money.svelte";
  import { today } from "../../lib/finance";
  import { monthLabel } from "../../lib/format";
  import { monthContributions } from "../../lib/savingsMonth";

  let { mobile = false }: { mobile?: boolean } = $props();

  const ym = today().slice(0, 7);
  const month = monthLabel(ym, true).split(" ")[0];

  const rows = $derived([...monthContributions(ym).values()]);
  const goal = $derived(rows.reduce((a, r) => a + r.goal, 0));
  const done = $derived(rows.reduce((a, r) => a + Math.min(r.given, r.goal), 0));
  const missing = $derived(Math.max(0, goal - done));
  const complete = $derived(rows.filter((r) => r.done).length);
  const pct = (n: number) => (goal > 0 ? Math.round((n / goal) * 100) : 0);
</script>

{#if goal > 0}
  <section class="card sm-card" class:mobile>
    <div class="sm-head">
      <span class="sm-label">Aportes de {month}</span>
      <span class="sm-count">{complete} de {rows.length} {rows.length === 1 ? "ahorro completo" : "ahorros completos"}</span>
    </div>
    <div
      class="sm-meter"
      role="img"
      aria-label={`Registraste el ${pct(done)}% de los aportes del mes y falta el ${pct(missing)}%.`}
    >
      <span class="sm-done" style:width="{pct(done)}%"></span>
    </div>
    <dl class="sm-parts">
      <div>
        <dt><i class="sm-dot done"></i>Registrado</dt>
        <dd><Money value={done} /><span class="sm-pct">{pct(done)}%</span></dd>
      </div>
      <div>
        <dt><i class="sm-dot"></i>Falta</dt>
        <dd><Money value={missing} /><span class="sm-pct">{pct(missing)}%</span></dd>
      </div>
      <div>
        <dt>Total del mes</dt>
        <dd><Money value={goal} /></dd>
      </div>
    </dl>
    <p class="sm-text">
      {missing > 0 ? "Registra los aportes que faltan para completar tus ahorros del mes." : "Ya registraste todos los aportes del mes."}
    </p>
  </section>
{/if}

<style>
  .sm-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    padding: var(--sp-16) var(--sp-20);

    &.mobile {
      margin: 0 var(--sp-12) var(--sp-12);
      padding: var(--sp-16);
    }
  }

  .sm-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-4) var(--sp-12);
  }

  .sm-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .sm-count {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .sm-meter {
    height: 0.5rem;
    overflow: hidden;
    border-radius: var(--radius-pill, 99px);
    background: oklch(from var(--viz-saving) l c h / 0.2);

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--viz-saving);
    }
  }

  .sm-parts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-8);
    margin: 0;

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
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--sp-4) var(--sp-6);
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 600;
    }
  }

  .sm-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.3rem;
    border-radius: 50%;
    background: oklch(from var(--viz-saving) l c h / 0.3);
    vertical-align: 0.05em;

    &.done {
      background: var(--viz-saving);
    }
  }

  .sm-pct {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 400;
  }

  .sm-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
