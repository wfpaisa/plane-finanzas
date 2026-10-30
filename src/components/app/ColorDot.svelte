<!-- El color de una cuenta o ahorro: un punto, lo único de color en la tarjeta. -->
<script lang="ts">
  import { colorOf } from "../../lib/palettes";

  let { color, size = 8 }: { color?: string | null; size?: number } = $props();

  const c = $derived(colorOf(color));
</script>

<i class="color-dot" style:--dot={c} style:width="{size}px" style:height="{size}px" aria-hidden="true"></i>

<style>
  .color-dot {
    display: inline-block;
    flex: none;
    border-radius: 50%;
    background: var(--dot);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--dot) 18%, transparent);
  }
</style>
