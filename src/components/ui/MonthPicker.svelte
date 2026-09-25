<!--
  Elegir un mes ("AAAA-MM") en español.

  El `<input type="month">` del navegador escribe el mes en el idioma del
  sistema ("September 2026") y eso no se cambia con `lang`: por eso un botón
  con el mes y, al abrirlo, el año con flechas y los doce meses.
-->
<script lang="ts">
  import { monthLabel, monthName } from "../../lib/format";
  import { today } from "../../lib/finance";
  import Icon from "../Icon.svelte";
  import Dropdown from "./Dropdown.svelte";

  let {
    value = $bindable(),
    disabled = false,
  }: {
    value: string;
    disabled?: boolean;
  } = $props();

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = (n: number) => String(n).padStart(2, "0");

  // El año que se ve en el menú: arranca en el del mes elegido.
  let year = $state(Number(value.slice(0, 4)));
  const current = today().slice(0, 7);
</script>

<Dropdown class="month-menu">
  {#snippet trigger({ open, toggle })}
    <button
      type="button"
      class="field-control sm month-trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      {disabled}
      onclick={() => {
        year = Number(value.slice(0, 4));
        toggle();
      }}
      >{capitalize(monthLabel(value, true))}<Icon name="calendar-03" size={14} /></button
    >
  {/snippet}
  {#snippet children(close)}
    <div class="month-year">
      <button type="button" class="btn-icon sm" aria-label="Año anterior" onclick={() => year--}
        ><Icon name="arrow-left-01" /></button
      >
      <b>{year}</b>
      <button type="button" class="btn-icon sm" aria-label="Año siguiente" onclick={() => year++}
        ><Icon name="arrow-right-01" /></button
      >
    </div>
    <div class="month-grid">
      {#each Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`) as ym, i (ym)}
        <button
          type="button"
          class="month-cell"
          class:selected={ym === value}
          class:current={ym === current}
          aria-pressed={ym === value}
          aria-label={capitalize(monthLabel(ym, true))}
          onclick={() => {
            value = ym;
            close();
          }}>{capitalize(monthName(i + 1).slice(0, 3))}</button
        >
      {/each}
    </div>
  {/snippet}
</Dropdown>

<style>
  .month-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    min-width: 10.5rem;
    justify-content: space-between;
    cursor: pointer;
    text-align: left;

    &:disabled {
      cursor: default;
      opacity: 0.5;
    }
  }

  :global(.month-menu) {
    padding: var(--sp-8);
    width: 15rem;
  }

  .month-year {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-8);
  }

  .month-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-4);
  }

  .month-cell {
    padding: var(--sp-6) 0;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius-sm, 6px);
    background: none;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    text-align: center;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }

    &.current {
      border-color: var(--border);
    }

    &.selected {
      background: color-mix(in oklab, var(--accent) 18%, transparent);
      color: var(--accent);
      font-weight: 600;
    }
  }
</style>
