<!--
  Un campo para el día del mes: al tocarlo se abre una cuadrícula del 1 al
  31, como la de un calendario. El valor es el número del día (null sin día).
-->
<script lang="ts">
  import { cx } from "../../lib/cx";
  import Icon from "../Icon.svelte";
  import Dropdown from "./Dropdown.svelte";

  let {
    value = $bindable<number | null>(null),
    disabled = false,
    placeholder = "Elige un día",
    class: className,
    "aria-label": ariaLabel,
  }: {
    value?: number | null;
    disabled?: boolean;
    placeholder?: string;
    class?: string;
    "aria-label"?: string;
  } = $props();

  const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
  let grid = $state<HTMLDivElement | null>(null);

  // Al abrir, el foco va al día elegido (o al 1) para moverse con las flechas.
  function focusDay(day: number) {
    grid?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
  }

  function keys(e: KeyboardEvent, day: number) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = day + step;
    if (next >= 1 && next <= 31) focusDay(next);
  }
</script>

<Dropdown class="day-menu" wrapClass={cx("day-wrap", className)}>
  {#snippet trigger({ open, toggle })}
    <button
      type="button"
      class="field-control w-full day-field"
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      {disabled}
      onclick={() => {
        toggle();
        if (!open) requestAnimationFrame(() => focusDay(value ?? 1));
      }}
    >
      {#if value}
        <span>Día <span class="number">{value}</span></span>
      {:else}
        <span class="day-empty">{placeholder}</span>
      {/if}
      <Icon name="calendar-03" size={16} />
    </button>
  {/snippet}
  {#snippet children(close)}
    <div class="day-grid" bind:this={grid} role="group" aria-label="Días del mes">
      {#each DAYS as day (day)}
        <button
          type="button"
          class={cx("day", day === value && "on")}
          data-day={day}
          aria-pressed={day === value}
          onkeydown={(e) => keys(e, day)}
          onclick={() => {
            value = day;
            close();
          }}>{day}</button
        >
      {/each}
    </div>
    <p class="day-note">Si el mes tiene menos días, se usa su último día.</p>
  {/snippet}
</Dropdown>

<style>
  :global(.day-wrap) {
    display: flex;
    width: 100%;
  }

  .day-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    text-align: left;
    cursor: pointer;

    & :global(svg) {
      flex: none;
      color: var(--text-muted);
    }
  }

  .day-empty {
    color: var(--text-subtle);
  }

  :global(.day-menu) {
    box-sizing: border-box;
    width: 17.5rem;
    padding: var(--sp-10);
    overflow: hidden;
  }

  .day-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--sp-4);
  }

  .day {
    min-width: 0;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm, 0.5rem);
    background: transparent;
    font-family: var(--font-num);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }

    &.on {
      background: var(--accent);
      color: var(--accent-text);
    }
  }

  .day-note {
    margin: var(--sp-8) var(--sp-4) 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
