<!--
  La barra de abajo, la misma en el teléfono y en la versión completa cuando
  la ventana es angosta: las cuatro secciones principales y "Más". Cada
  pestaña es un enlace (`href`) o un botón (`onPick`); lo que se abre desde
  "Más" (su hoja) va en `children`.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import Icon from "../Icon.svelte";

  export interface TabItem {
    id: string;
    label: string;
    icon: string;
    href?: string;
    /** Un aviso en el icono: cuántos correos esperan, por ejemplo. */
    count?: number;
  }

  let {
    items,
    active,
    onPick,
    children,
  }: {
    items: TabItem[];
    active: string;
    onPick?: (id: string) => void;
    children?: Snippet;
  } = $props();
</script>

<nav class="tabbar" aria-label="Secciones">
  {#each items as it (it.id)}
    {@const on = it.id === active}
    {#snippet inner()}
      <span class="tb-ic">
        <Icon name={it.icon} size={20} />
        {#if it.count}<span class="tb-count" aria-label="{it.count} pendientes">{it.count > 99 ? "99+" : it.count}</span>{/if}
      </span>
      <span class="tb-label">{it.label}</span>
    {/snippet}
    {#if it.href}
      <a href={it.href} class:active={on} aria-current={on ? "page" : undefined}>{@render inner()}</a>
    {:else}
      <button type="button" class:active={on} aria-current={on ? "page" : undefined} onclick={() => onPick?.(it.id)}>
        {@render inner()}
      </button>
    {/if}
  {/each}
  {@render children?.()}
</nav>

<style>
  /* Vidrio de lo que flota, pegado abajo. En el teléfono se centra con la
     columna de la app (`--tabbar-max`, ver routes/Mobile.svelte). */
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    max-width: var(--tabbar-max, none);
    margin: 0 auto;
    padding: var(--sp-6) var(--sp-4) calc(var(--sp-6) + env(safe-area-inset-bottom));
    border-top: var(--border-width, 1px) solid var(--border);
    background: var(--glass-sheen), var(--glass-2);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
    box-shadow: var(--glass-spec);

    & > a,
    & > button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
      min-width: 0;
      min-height: 2.75rem;
      padding: var(--sp-4);
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      font: inherit;
      /* "Movimientos" cabe entero en un teléfono angosto. */
      font-size: clamp(0.5625rem, 2.75vw, 0.6875rem);
      letter-spacing: -0.005em;
      color: var(--text-muted);
      text-decoration: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: color 0.2s;

      &:active .tb-ic {
        scale: 0.92;
      }

      &:focus-visible {
        outline: 2px solid var(--focus-ring);
        outline-offset: -2px;
      }

      &.active {
        color: var(--accent);
        font-weight: 600;
      }
    }
  }

  .tb-ic {
    position: relative;
    display: grid;
    place-items: center;
    transition: scale 0.15s;
  }

  .tb-label {
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* Como el contador de Correos en el menú lateral. */
  .tb-count {
    position: absolute;
    top: -0.3rem;
    left: calc(100% - 0.4rem);
    min-width: 1rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-pill);
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--glass-2);
    color: var(--accent-text);
    font-size: 0.625rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1rem;
    text-align: center;
  }
</style>
