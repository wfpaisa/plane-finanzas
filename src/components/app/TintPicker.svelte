<!--
  El tinte del fondo: "Por defecto" (la bruma de partida) o cualquier color,
  con los colores rápidos, la rueda o el hexadecimal (`ColorPicker`).
-->
<script lang="ts">
  import { tint } from "../../lib/tint.svelte";
  import ColorPicker from "./ColorPicker.svelte";
</script>

<div class="tint-picker">
  <button type="button" class="opt-tile tint-default" class:selected={!tint.value} aria-pressed={!tint.value} onclick={() => tint.set(null)}>
    <span class="tint-sample" aria-hidden="true"></span>
    <span>Por defecto</span>
  </button>
  <ColorPicker bind:value={() => tint.value ?? "", (c) => tint.set(c || null)} label="Tinte del fondo" />
</div>

<style>
  .tint-picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-14);
  }

  .tint-default {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: var(--sp-6) var(--sp-14) var(--sp-6) var(--sp-6);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 550;
  }

  /* La bruma de partida en pequeño, con sus colores fijos. */
  .tint-sample {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: linear-gradient(180deg, oklch(0.6 0.05 238), oklch(0.88 0.03 190) 60%, oklch(0.93 0.012 205));
    box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.08);
  }
</style>
