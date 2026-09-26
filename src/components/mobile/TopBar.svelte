<!-- La barra de arriba de cada pestaña del celular: lo suyo a la izquierda y
     las acciones a la derecha, con el estado de la conexión cuando hace falta. -->
<script lang="ts">
  import type { Snippet } from "svelte";

  import SyncButton from "./SyncButton.svelte";

  let { children, actions }: { children: Snippet; actions?: Snippet } = $props();
</script>

<header class="tb">
  <div class="tb-main">{@render children()}</div>
  <div class="tb-actions"><SyncButton />{@render actions?.()}</div>
</header>

<style>
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
    background: var(--glass-2, var(--bg-level1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px));
    backdrop-filter: blur(var(--glass-blur, 16px));
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
</style>
