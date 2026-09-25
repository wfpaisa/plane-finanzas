<!--
  La marca: la F de Finanzas, dos trazos en escalón. Toma `currentColor`, así
  que se pinta del color del texto que la rodea. `size` es la altura.
  Los mismos trazos están en `public/favicon.svg` y en los íconos de `public/pwa`.
-->
<script lang="ts">
  let { size = 18 }: { size?: number } = $props();
</script>

<svg viewBox="18 10 62 80" height={size} width={(size * 62) / 80} aria-hidden="true">
  <path
    d="M24 54V30a14 14 0 0 1 14-14h42M42 90V64a14 14 0 0 1 14-14h18"
    fill="none"
    stroke="currentColor"
    stroke-width="11"
  />
</svg>
