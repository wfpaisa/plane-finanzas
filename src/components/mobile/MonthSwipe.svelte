<!--
  Deslizar el dedo para cambiar de mes, como en las apps de gastos: hacia la
  izquierda el siguiente, hacia la derecha el anterior. El contenido del mes
  nuevo entra desde el lado al que se fue, también con las flechas de MonthNav.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import { addMonths } from "../../lib/finance";

  let {
    ym = $bindable(),
    step = 1,
    children,
  }: { ym: string; step?: number; children: Snippet } = $props();

  // De dónde entra el mes nuevo: 1 de la derecha (siguiente), -1 de la izquierda.
  let dir = $state(0);
  let prev = ym;
  $effect.pre(() => {
    if (ym !== prev) {
      dir = ym > prev ? 1 : -1;
      prev = ym;
    }
  });

  let start: { x: number; y: number; t: number } | null = null;

  /** Lo que se desplaza de lado por sí mismo (pestañas, tablas anchas) se
   *  queda con su gesto. */
  function scrollsSideways(el: Element | null) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
  }

  function onStart(e: TouchEvent) {
    const t = e.touches[0];
    // Desde el borde es el gesto de volver del teléfono, no el de cambiar de mes.
    const edge = t.clientX < 24 || t.clientX > innerWidth - 24;
    start = e.touches.length === 1 && !edge && !scrollsSideways(e.target as Element) ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
  }

  function onEnd(e: TouchEvent) {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const quick = e.timeStamp - start.t < 700;
    start = null;
    if (quick && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ym = addMonths(ym, dx < 0 ? step : -step);
  }
</script>

<!-- El gesto repite las flechas de MonthNav: no hace falta que sea un control. -->
<div class="ms" role="presentation" ontouchstart={onStart} ontouchend={onEnd} ontouchcancel={() => (start = null)}>
  {#key ym}
    <div class="ms-page" class:slide={dir !== 0} style:--dir={dir}>
      {@render children()}
    </div>
  {/key}
</div>

<style>
  /* Alto de sobra para poder deslizar aunque el mes esté vacío. */
  .ms {
    min-height: 60dvh;
    overflow-x: clip;
  }

  .ms-page.slide {
    animation: ms-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes ms-in {
    from {
      opacity: 0;
      translate: calc(var(--dir) * 3rem) 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ms-page.slide {
      animation: none;
    }
  }
</style>
