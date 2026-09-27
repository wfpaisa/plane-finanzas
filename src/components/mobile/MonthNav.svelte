<!--
  ‹ sept 2026 › — o solo el año. Tocar el mes despliega un selector: el año
  con sus flechas y los doce meses (o doce años, si se ve por año).
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { addMonths, today } from "../../lib/finance";
  import { monthLabel } from "../../lib/format";
  import { closeOnBack } from "../../lib/router.svelte";

  let { ym = $bindable(), yearly = false }: { ym: string; yearly?: boolean } = $props();

  const step = $derived(yearly ? 12 : 1);

  // Cada selector se ancla a su propio botón: puede haber dos en la página.
  const id = `mn-${Math.random().toString(36).slice(2, 8)}`;
  let pop = $state<HTMLDivElement | null>(null);
  let open = $state(false);

  /** El año que se está viendo en el selector; por año, el último de la página de doce. */
  let shown = $state(0);
  const year = $derived(Number(ym.slice(0, 4)));
  const now = today().slice(0, 7);

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const years = $derived(Array.from({ length: 12 }, (_, i) => shown - 11 + i));

  // El botón de atrás del teléfono lo cierra.
  $effect(() => {
    if (open) return closeOnBack(() => pop?.hidePopover());
  });

  function onToggle(e: ToggleEvent) {
    open = e.newState === "open";
    // Al abrir, el año del mes elegido; por año, una página que lo incluya.
    if (open) shown = yearly ? Math.max(year, Number(now.slice(0, 4))) : year;
  }

  function pick(next: string) {
    ym = next;
    pop?.hidePopover();
  }
</script>

<div class="mn">
  <button type="button" class="btn-icon sm" aria-label={yearly ? "Año anterior" : "Mes anterior"} onclick={() => (ym = addMonths(ym, -step))}>
    <Icon name="arrow-left-01" size={20} />
  </button>
  <button
    type="button"
    class="mn-label"
    class:open
    popovertarget={id}
    aria-label={yearly ? "Elegir año" : "Elegir mes"}
    style:anchor-name="--{id}"
  >
    {yearly ? ym.slice(0, 4) : monthLabel(ym)}
  </button>
  <button type="button" class="btn-icon sm" aria-label={yearly ? "Año siguiente" : "Mes siguiente"} onclick={() => (ym = addMonths(ym, step))}>
    <Icon name="arrow-right-01" size={20} />
  </button>
</div>

<div bind:this={pop} {id} class="mn-pop" popover style:position-anchor="--{id}" ontoggle={onToggle}>
  <div class="mn-head">
    <button type="button" class="btn-icon sm" aria-label="Antes" onclick={() => (shown -= yearly ? 12 : 1)}>
      <Icon name="arrow-left-01" size={18} />
    </button>
    <span>{yearly ? `${years[0]} – ${years[11]}` : shown}</span>
    <button type="button" class="btn-icon sm" aria-label="Después" onclick={() => (shown += yearly ? 12 : 1)}>
      <Icon name="arrow-right-01" size={18} />
    </button>
  </div>
  <div class="mn-grid">
    {#if yearly}
      {#each years as y (y)}
        <button
          type="button"
          class:on={y === year}
          class:today={String(y) === now.slice(0, 4)}
          onclick={() => pick(`${y}${ym.slice(4)}`)}>{y}</button
        >
      {/each}
    {:else}
      {#each months as m (m)}
        {@const key = `${shown}-${m}`}
        <button type="button" class:on={key === ym} class:today={key === now} onclick={() => pick(key)}>
          {monthLabel(key).split(" ")[0]}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .mn {
    display: flex;
    align-items: center;
    gap: var(--sp-2, 0.125rem);
  }

  .mn-label {
    min-width: 5.5rem;
    padding: var(--sp-4) var(--sp-8);
    border: 0;
    border-radius: var(--radius-pill, 99px);
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--text-primary);
    text-align: center;
    cursor: pointer;

    &:active,
    &.open {
      background: var(--bg-field);
    }
  }

  .mn-pop {
    inset: auto;
    width: min(18rem, calc(100vw - 2rem));
    margin: var(--sp-6) 0 0;
    padding: var(--sp-8);
    position-area: bottom center;
    position-try-fallbacks: flip-block;
    border: 1px solid var(--glass-rim, var(--border-float));
    border-radius: var(--radius-lg, 12px);
    background: var(--glass-sheen, none), oklch(from var(--glass-2, var(--bg-float)) l c h / 0.85);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur, 16px) * 1.2)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(calc(var(--glass-blur, 16px) * 1.2)) saturate(var(--glass-sat, 170%));
    box-shadow:
      var(--glass-spec, none),
      var(--shadow-xl);
    color: var(--text-primary);
    transform-origin: top center;
    opacity: 0;
    scale: 0.96;
    transition:
      opacity 0.1s ease-in,
      scale 0.1s ease-in,
      overlay 0.1s allow-discrete,
      display 0.1s allow-discrete;

    &:popover-open {
      opacity: 1;
      scale: 1;
      transition:
        opacity 0.12s ease-out,
        scale 0.18s cubic-bezier(0.16, 1, 0.3, 1),
        overlay 0.18s allow-discrete,
        display 0.18s allow-discrete;
    }

    @starting-style {
      &:popover-open {
        opacity: 0;
        scale: 0.96;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &,
      &:popover-open {
        transition: none;
        scale: 1;
      }
    }
  }

  .mn-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--sp-6);

    & span {
      font-family: var(--font-num, inherit);
      font-size: var(--text-sm);
      font-weight: 600;
    }
  }

  .mn-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-4);

    & button {
      min-height: 2.5rem;
      border: 0;
      border-radius: var(--radius-pill, 99px);
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-secondary);
      cursor: pointer;

      &:active {
        background: var(--bg-field);
      }

      &.today {
        color: var(--accent);
        font-weight: 600;
      }

      &.on {
        background: var(--accent);
        color: var(--accent-text);
        font-weight: 600;
      }
    }
  }
</style>
