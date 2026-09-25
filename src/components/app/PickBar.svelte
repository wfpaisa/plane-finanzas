<!--
  La barra de lo marcado con clic derecho: cuántos van, sus sumas (lo que
  se le pase adentro) y las acciones de marcar todos o quitar la marca.
  Pegada al fondo de la página mientras hay algo marcado; Esc la limpia.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "../Icon.svelte";

  let {
    count,
    onAll,
    onClear,
    children,
    actions,
  }: {
    count: number;
    /** Sin él no aparece el botón "Todos" (ya está todo marcado). */
    onAll?: () => void;
    onClear: () => void;
    children: Snippet;
    /** Botones extra de la pantalla, antes de "Todos". */
    actions?: Snippet;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && !document.querySelector(":popover-open") && onClear()} />

<div class="pick-bar" role="status">
  <span class="pick-count">{count} {count === 1 ? "seleccionado" : "seleccionados"}</span>
  <span class="pick-sums">{@render children()}</span>
  <span class="pick-actions">
    {@render actions?.()}
    {#if onAll}
      <button type="button" class="pick-all" onclick={onAll}>Todos</button>
    {/if}
    <button type="button" class="pick-clear" aria-label="Quitar selección" data-tip="Quitar selección (Esc)" onclick={onClear}>
      <Icon name="cancel-01" size={14} />
    </button>
  </span>
</div>

<style>
  /* Pegada al fondo mientras hay algo marcado y centrada en el área de
     contenido (sin el sidebar): vive dentro de `.page`, así que el
     `margin-inline: auto` la centra ahí. */
  .pick-bar {
    position: sticky;
    /* `sticky` se mide desde dentro del relleno de abajo de <main> (6rem;
       8rem en el celular, ver App.svelte): se le resta para quedar a 0.75rem
       del borde de la ventana. */
    bottom: calc(0.75rem - 6rem);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    width: fit-content;
    /* Aire a los dos lados para no chocar con el botón + de la esquina. */
    max-width: calc(100% - 9rem);
    margin: var(--sp-20) auto 0;
    padding: 0.3125rem;
    border: 1px solid color-mix(in oklab, var(--accent) 55%, transparent);
    border-radius: 999px;
    background: var(--bg-float);
    -webkit-backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-sat, 170%));
    box-shadow:
      var(--glass-spec, 0 0 transparent),
      0 12px 32px -10px color-mix(in oklab, var(--accent) 30%, transparent),
      var(--shadow-xl);
    font-size: var(--text-sm);
    color: var(--text-muted);
    animation: pick-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);

    & :global(.money) {
      margin-left: 0.3rem;
      font-weight: 600;
    }

    @media (max-width: 56rem) {
      bottom: calc(4.75rem - 8rem);
      flex-wrap: wrap;
      max-width: calc(100% - 4.5rem);
      margin-left: 0;
      border-radius: var(--radius-lg);
    }
  }

  @keyframes pick-in {
    from {
      opacity: 0;
      translate: 0 0.5rem;
    }
  }

  .pick-count {
    flex: none;
    padding: 0.3125rem 0.75rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .pick-sums {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4) var(--sp-16);

    & > :global(span) {
      white-space: nowrap;
    }
  }

  /* Las acciones, separadas de las sumas por un filo. */
  .pick-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    padding-left: var(--sp-10);
    border-left: 1px solid var(--border);
  }

  .pick-all,
  .pick-clear,
  .pick-actions > :global(.pick-extra) {
    display: inline-grid;
    place-items: center;
    height: 1.875rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  .pick-actions > :global(.pick-extra) {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .pick-actions > :global(.pick-extra[aria-pressed="true"]) {
    color: var(--accent);
  }

  .pick-all,
  .pick-actions > :global(.pick-extra) {
    padding: 0 0.75rem;
  }

  .pick-clear {
    width: 1.875rem;
  }
</style>
