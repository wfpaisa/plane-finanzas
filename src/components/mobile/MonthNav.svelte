<!--
  ‹ 2026 · Sep › — o solo el año. Tocar el mes despliega el calendario de
  meses (o de años, si se ve por año), el mismo del escritorio.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { addMonths } from "../../lib/finance";
  import { monthYm } from "../../lib/format";
  import { Calendar } from "../ui";
  import { closeOnBack } from "../../lib/router.svelte";

  let { ym = $bindable(), yearly = false }: { ym: string; yearly?: boolean } = $props();

  const step = $derived(yearly ? 12 : 1);

  // Cada selector se ancla a su propio botón: puede haber dos en la página.
  const id = `mn-${Math.random().toString(36).slice(2, 8)}`;
  let pop = $state<HTMLDivElement | null>(null);
  let open = $state(false);

  // El botón de atrás del teléfono lo cierra.
  $effect(() => {
    if (open) return closeOnBack(() => pop?.hidePopover());
  });

  function onToggle(e: ToggleEvent) {
    open = e.newState === "open";
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
    {yearly ? ym.slice(0, 4) : monthYm(ym, true)}
  </button>
  <button type="button" class="btn-icon sm" aria-label={yearly ? "Año siguiente" : "Mes siguiente"} onclick={() => (ym = addMonths(ym, step))}>
    <Icon name="arrow-right-01" size={20} />
  </button>
</div>

<div bind:this={pop} {id} class="mn-pop" popover style:position-anchor="--{id}" ontoggle={onToggle}>
  <!-- Montado solo abierto: así abre siempre en el mes o el año elegido. -->
  {#if open}
    <Calendar
      mode={yearly ? "year" : "month"}
      value={yearly ? ym.slice(0, 4) : ym}
      onpick={(v) => pick(yearly ? `${v}${ym.slice(4)}` : v)}
    />
  {/if}
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
    white-space: nowrap;
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

</style>
