<!-- La barra de arriba de cada pestaña del celular: lo suyo a la izquierda y
     las acciones a la derecha, con el estado de la conexión cuando hace falta.
     Con `brand`, la marca de la app como arriba del menú lateral de escritorio. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  import Logo from "../Logo.svelte";
  import SyncButton from "./SyncButton.svelte";

  let { children, actions, brand = false }: { children?: Snippet; actions?: Snippet; brand?: boolean } = $props();
</script>

<header class="tb">
  <div class="tb-main">
    {#if brand}<span class="tb-brand"><span class="tb-mark"><Logo size={15} /></span>Finanzas</span>{/if}
    {@render children?.()}
  </div>
  <div class="tb-actions"><SyncButton />{@render actions?.()}</div>
</header>

<style>
  /* El mismo vidrio que la barra de abajo (ver app/TabBar.svelte). */
  .tb {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    min-height: 3.5rem;
    padding: var(--sp-6) var(--sp-8) var(--sp-6) var(--sp-12);
    padding-top: calc(var(--sp-6) + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
    background: var(--glass-sheen), var(--glass-2, var(--bg-level1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));
    box-shadow: var(--glass-spec);
  }

  .tb-main,
  .tb-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
  }

  .tb-main {
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .tb-brand {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding-left: var(--sp-4);
    letter-spacing: -0.02em;
  }

  /* Igual que el ícono de la app: negro con brillo azul detrás de la F. */
  .tb-mark {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5625rem;
    background:
      radial-gradient(circle at 50% 44%, oklch(0.52 0.25 265 / 0.6), transparent 70%),
      oklch(0.12 0.005 265);
    color: #fff;
    box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.12);
  }
</style>
