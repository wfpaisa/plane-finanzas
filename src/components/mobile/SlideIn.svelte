<!--
  Lo que cambia con una pestaña o un mes entra desde el lado hacia donde se
  movió: de la derecha si se fue a una pestaña (o mes) de más adelante, de la
  izquierda si se volvió a una de antes.
-->
<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  let {
    key,
    order,
    children,
  }: {
    key: string;
    /** El orden de las pestañas; sin él se comparan las claves (meses `2026-09`). */
    order?: readonly string[];
    children: Snippet;
  } = $props();

  const rank = (k: string, other: string) =>
    order ? order.indexOf(k) - order.indexOf(other) : k.localeCompare(other);

  // 1: entra de la derecha; -1: de la izquierda; 0: la primera vez, sin moverse.
  let dir = $state(0);
  let prev = untrack(() => key);
  $effect.pre(() => {
    if (key !== prev) {
      dir = Math.sign(rank(key, prev)) || 1;
      prev = key;
    }
  });
</script>

<div class="si">
  {#key key}
    <div class="si-page" class:slide={dir !== 0} style:--dir={dir}>
      {@render children()}
    </div>
  {/key}
</div>

<style>
  /* Lo que entra de lado no ensancha la página mientras llega. */
  .si {
    overflow-x: clip;
  }

  .si-page.slide {
    animation: si-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes si-in {
    from {
      opacity: 0;
      translate: calc(var(--dir) * 3rem) 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .si-page.slide {
      animation: none;
    }
  }
</style>
