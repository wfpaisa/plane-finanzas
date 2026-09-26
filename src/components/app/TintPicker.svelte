<!--
  El tinte del fondo: "Por defecto" (la bruma de partida) y los pasteles en
  una sola fila de círculos, o cualquier color con la rueda o el hexadecimal
  (`ColorPicker`). Cada pastel se pinta con el mismo degradado de la bruma,
  en su tono. El monocromo es un gris: sin croma, el fondo no se tiñe.
-->
<script lang="ts">
  import { oklchOf } from "../../lib/palettes";
  import { tint } from "../../lib/tint.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  const PASTELS = [
    { name: "Rosa", hex: "#febccf" },
    { name: "Coral", hex: "#ffbeb2" },
    { name: "Durazno", hex: "#fbc49f" },
    { name: "Vainilla", hex: "#e5cf94" },
    { name: "Pistacho", hex: "#c5dba1" },
    { name: "Menta", hex: "#a3e2bf" },
    { name: "Aguamarina", hex: "#91e2dc" },
    { name: "Cielo", hex: "#97ddf9" },
    { name: "Lavanda", hex: "#c6ccff" },
    { name: "Lila", hex: "#e5c2f6" },
    { name: "Monocromo", hex: "#d1d1d1", gray: true },
  ].map((p) => ({ ...p, h: oklchOf(p.hex).h.toFixed(1), k: p.gray ? 0 : 1 }));

  const current = $derived(tint.value?.toLowerCase() ?? null);
</script>

<div class="tint-picker">
  <div class="tint-options" role="group" aria-label="Tintes rápidos">
    <button
      type="button"
      class="opt-tile tint-swatch tint-default"
      class:selected={!current}
      aria-pressed={!current}
      aria-label="Por defecto"
      data-tip="Por defecto"
      onclick={() => tint.set(null)}
    ></button>
    {#each PASTELS as p (p.hex)}
      <button
        type="button"
        class="opt-tile tint-swatch"
        class:selected={current === p.hex}
        style:--h={p.h}
        style:--k={p.k}
        aria-pressed={current === p.hex}
        aria-label="Usar {p.name}"
        data-tip={p.name}
        onclick={() => tint.set(p.hex)}
      ></button>
    {/each}
  </div>
  <ColorPicker bind:value={() => tint.value ?? "", (c) => tint.set(c || null)} label="Tinte del fondo" presets={false} placeholder="Por defecto" />
</div>

<style>
  .tint-picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-14);
  }

  .tint-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-10);
  }

  /* El mismo degradado de la bruma de partida, llevado al tono de cada pastel.
     Arranca desde el borde: si no, se repite debajo de él y asoma el claro
     arriba y el oscuro abajo. */
  .tint-swatch {
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border-radius: 50%;
    background: linear-gradient(180deg, oklch(0.68 calc(0.07 * var(--k)) var(--h)), oklch(0.88 calc(0.045 * var(--k)) var(--h)) 60%, oklch(0.94 calc(0.018 * var(--k)) var(--h))) border-box;
  }

  /* La bruma de partida, con sus colores fijos. */
  .tint-default {
    background: linear-gradient(180deg, oklch(0.6 0.05 238), oklch(0.88 0.03 190) 60%, oklch(0.93 0.012 205)) border-box;
  }
</style>
