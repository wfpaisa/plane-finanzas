<!--
  Un solo color: los base de las monocromas a un clic, o cualquiera con la
  rueda del sistema o escribiendo el hexadecimal. Es el mismo control del
  color a mano de Planer (`PaletteCustomField` + accesos rápidos), y sirve
  igual para la paleta personalizada que para el punto de una cuenta.

  Mientras el campo de texto tiene el foco manda lo escrito (`draft`); así
  "#e2e" a medio teclear no salta a "#ee22ee" antes de terminar.
-->
<script lang="ts">
  import { parseHex, PRESET_COLORS } from "../../lib/palettes";

  let { value = $bindable(""), label = "Color" }: { value?: string; label?: string } = $props();

  let draft = $state<string | null>(null);
  const shown = $derived(draft ?? value);
  const current = $derived(value.toLowerCase());

  function edit(raw: string) {
    draft = raw;
    if (/^#[0-9a-f]{6}$/i.test(raw.trim())) value = raw.trim().toLowerCase();
  }

  function finish() {
    const hex = draft === null ? null : parseHex(draft);
    if (hex) value = hex;
    draft = null;
  }
</script>

<div class="color-picker">
  <label class="color-hex" data-tip="Escribir el color exacto">
    <span class="swatch-color color-now" style:background={value || "transparent"}></span>
    <input
      type="color"
      value={value || "#000000"}
      oninput={(e) => (value = e.currentTarget.value.toLowerCase())}
      aria-label="{label}: elegir en la rueda de color"
      class="color-native"
    />
    <input
      type="text"
      value={shown}
      oninput={(e) => edit(e.currentTarget.value)}
      onblur={finish}
      onkeydown={(e) => e.key === "Enter" && finish()}
      spellcheck="false"
      placeholder="#000000"
      aria-label="{label}: código hexadecimal"
      class="color-text"
    />
  </label>

  <div class="color-presets" role="group" aria-label="Colores rápidos">
    {#each PRESET_COLORS as p (p.hex)}
      <button
        type="button"
        class="opt-tile swatch-color"
        class:selected={current === p.hex}
        style:background={p.hex}
        data-tip={p.name}
        aria-label="Usar {p.name}"
        aria-pressed={current === p.hex}
        onclick={() => (value = p.hex)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .color-picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-10);
  }

  .color-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
  }

  .color-hex {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    height: 2.25rem;
    padding: 0 var(--sp-10) 0 var(--sp-4);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    cursor: pointer;
    transition: border-color 150ms;

    &:hover {
      border-color: var(--border-strong);
    }
  }

  .color-now {
    border: var(--border-width) solid var(--border);
  }

  /* La rueda nativa escondida: se abre con el clic en la etiqueta. */
  .color-native {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .color-text {
    width: 5.5rem;
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-transform: uppercase;
    outline: none;
  }
</style>
