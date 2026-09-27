<!--
  Qué periodo mirar: un mes, un año, un rango de días o todo el historial.
  Un botón con el periodo y, al abrirlo, las cuatro formas con su calendario.
  Las flechas de los lados van al mes o al año anterior y siguiente.
-->
<script lang="ts" module>
  export type Period = { kind: "mes"; ym: string } | { kind: "año"; y: string } | { kind: "rango"; from: string; to: string } | { kind: "todo" };
</script>

<script lang="ts">
  import Segmented from "../app/Segmented.svelte";
  import { addMonths, today } from "../../lib/finance";
  import { dateYmd, monthYm } from "../../lib/format";
  import Icon from "../Icon.svelte";
  import Calendar from "./Calendar.svelte";
  import Dropdown from "./Dropdown.svelte";

  let { value = $bindable() }: { value: Period } = $props();

  type Kind = Period["kind"];
  const KINDS: { id: Kind; label: string }[] = [
    { id: "mes", label: "Mes" },
    { id: "año", label: "Año" },
    { id: "rango", label: "Rango" },
    { id: "todo", label: "Todo" },
  ];

  // La forma que se ve en el menú: arranca en la del periodo elegido.
  let kind = $state<Kind>(value.kind);
  // Dos meses lado a lado para el rango, si cabe.
  const wide = typeof matchMedia === "function" && matchMedia("(min-width: 40rem)").matches;

  const label = $derived(
    value.kind === "mes"
      ? monthYm(value.ym)
      : value.kind === "año"
        ? value.y
        : value.kind === "rango"
          ? `${dateYmd(value.from)} – ${dateYmd(value.to)}`
          : "Todo el historial",
  );

  /** El mes o el año de lo elegido, para abrir el calendario ahí. */
  const anchorYm = $derived(
    value.kind === "mes" ? value.ym : value.kind === "año" ? `${value.y}-01` : value.kind === "rango" ? value.from.slice(0, 7) : today().slice(0, 7),
  );

  const canStep = $derived(value.kind === "mes" || value.kind === "año");

  function step(n: number) {
    if (value.kind === "mes") value = { kind: "mes", ym: addMonths(value.ym, n) };
    else if (value.kind === "año") value = { kind: "año", y: String(Number(value.y) + n) };
  }
</script>

<div class="period">
  <button type="button" class="btn-icon sm" aria-label="Periodo anterior" data-tip="Anterior (←)" disabled={!canStep} onclick={() => step(-1)}>
    <Icon name="arrow-left-01" />
  </button>
  <Dropdown class="period-menu" align="right">
    {#snippet trigger({ open, toggle })}
      <button
        type="button"
        class="field-control sm period-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onclick={() => {
          kind = value.kind;
          toggle();
        }}>{label}<Icon name="calendar-03" size={14} /></button
      >
    {/snippet}
    {#snippet children(close)}
      <Segmented bind:value={kind} options={KINDS} full label="Periodo" />
      <div class="period-body">
        {#if kind === "mes"}
          <Calendar
            mode="month"
            value={value.kind === "mes" ? value.ym : anchorYm}
            onpick={(ym) => {
              value = { kind: "mes", ym };
              close();
            }}
          />
        {:else if kind === "año"}
          <Calendar
            mode="year"
            value={value.kind === "año" ? value.y : anchorYm.slice(0, 4)}
            onpick={(y) => {
              value = { kind: "año", y };
              close();
            }}
          />
        {:else if kind === "rango"}
          <Calendar
            mode="range"
            twoMonths={wide}
            value={value.kind === "rango" ? value.from : `${anchorYm}-01`}
            to={value.kind === "rango" ? value.to : ""}
            onpick={(from, to) => {
              value = { kind: "rango", from, to: to ?? from };
              close();
            }}
          />
          <p class="period-hint">Toca el primer día y luego el último.</p>
        {:else}
          <div class="period-all">
            <p>Todos los movimientos, sin importar la fecha.</p>
            <button
              type="button"
              class="btn btn-primary"
              onclick={() => {
                value = { kind: "todo" };
                close();
              }}>Ver todo el historial</button
            >
          </div>
        {/if}
      </div>
    {/snippet}
  </Dropdown>
  <button type="button" class="btn-icon sm" aria-label="Periodo siguiente" data-tip="Siguiente (→)" disabled={!canStep} onclick={() => step(1)}>
    <Icon name="arrow-right-01" />
  </button>
</div>

<style>
  .period {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
  }

  .period-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    min-width: 11rem;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  :global(.period-menu) {
    width: min(36rem, calc(100vw - 2rem));
    padding: var(--sp-10);
    --menu-max-height: 80vh;
  }

  /* Con un solo mes a la vista (rango en angosto, mes, año) no hace falta tanto ancho. */
  :global(.period-menu:not(:has(.vc[data-vc-type="multiple"]))) {
    width: 19rem;
  }

  .period-body {
    margin-top: var(--sp-10);
  }

  .period-hint {
    margin: var(--sp-6) 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-align: center;
  }

  .period-all {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-12);
    padding: var(--sp-16) var(--sp-8);
    text-align: center;

    & p {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  }
</style>
