<!--
  El tinte del fondo: "Por defecto" (la bruma de partida), los tonos suaves
  y los intensos en círculos, o cualquier color con la rueda o el
  hexadecimal (`ColorPicker`). En la bruma cada círculo se pinta con el
  degradado de la bruma en su tono; el monocromo es un gris: sin croma, el
  fondo no se tiñe.
  Con el estilo sólido el tinte es el color del acento tal cual, y cada
  círculo lo muestra así; el monocromo, en tinta.
-->
<script lang="ts">
  import { estilo } from "../../lib/estilo.svelte";
  import { oklchOf } from "../../lib/palettes";
  import { tint } from "../../lib/tint.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  type Swatch = { name: string; hex: string; gray?: boolean };

  // Los suaves: la misma luz y el mismo croma (OKLCH 0.86 / 0.08), por tono.
  const SOFT: Swatch[] = [
    { name: "Rosa", hex: "#febccf" },
    { name: "Salmón", hex: "#ffbdc1" },
    { name: "Coral", hex: "#ffbeb2" },
    { name: "Durazno", hex: "#fbc49f" },
    { name: "Albaricoque", hex: "#f2c997" },
    { name: "Vainilla", hex: "#e5cf94" },
    { name: "Limón", hex: "#d6d598" },
    { name: "Pistacho", hex: "#c5dba1" },
    { name: "Té verde", hex: "#b4dfae" },
    { name: "Menta", hex: "#a3e2bf" },
    { name: "Jade", hex: "#98e3ce" },
    { name: "Aguamarina", hex: "#91e2dc" },
    { name: "Turquesa", hex: "#90e0ec" },
    { name: "Cielo", hex: "#97ddf9" },
    { name: "Azul", hex: "#b0d5ff" },
    { name: "Lavanda", hex: "#c6ccff" },
    { name: "Violeta", hex: "#d6c7ff" },
    { name: "Lila", hex: "#e5c2f6" },
    { name: "Orquídea", hex: "#f4bde4" },
    { name: "Monocromo", hex: "#d1d1d1", gray: true },
  ];

  // Los intensos: para un acento vivo en el estilo sólido. En la bruma solo
  // cuenta el tono, así que ahí se verían igual que los suaves: no salen.
  const VIVID: Swatch[] = [
    { name: "Frambuesa", hex: "#dd316f" },
    { name: "Rojo", hex: "#f1383e" },
    { name: "Naranja", hex: "#f87103" },
    { name: "Ámbar", hex: "#f8ae01" },
    { name: "Lima", hex: "#92ce14" },
    { name: "Verde", hex: "#02af51" },
    { name: "Esmeralda", hex: "#03b382" },
    { name: "Petróleo", hex: "#03999f" },
    { name: "Azul rey", hex: "#006ae5" },
    { name: "Índigo", hex: "#473ded" },
    { name: "Púrpura", hex: "#8b3ae5" },
    { name: "Fucsia", hex: "#d633be" },
  ];

  /** Tono y cuánto tiñe, para el degradado de la bruma. */
  const paint = (s: Swatch) => {
    const { h, c } = oklchOf(s.hex);
    return { ...s, h: h.toFixed(1), k: s.gray ? 0 : Math.min(1.4, c / 0.08).toFixed(2) };
  };
  const soft = SOFT.map(paint);
  const vivid = VIVID.map(paint);
  const GROUPS = $derived(
    estilo.value === "solido"
      ? [
          { label: "Suaves", items: soft },
          { label: "Intensos", items: vivid },
        ]
      : [{ label: "Tonos", items: soft }],
  );
  const grouped = $derived(GROUPS.length > 1);

  const current = $derived(tint.value?.toLowerCase() ?? null);
</script>

<div class="tint-picker">
  {#each GROUPS as g, gi (g.label)}
    <div class="tint-group">
      {#if grouped}<span class="tint-label">{g.label}</span>{/if}
      <div class="tint-options" role="group" aria-label="Tonos {g.label.toLowerCase()}">
        {#if gi === 0}
          <button
            type="button"
            class="opt-tile tint-swatch tint-default"
            class:selected={!current}
            aria-pressed={!current}
            aria-label="Por defecto"
            data-tip="Por defecto"
            onclick={() => tint.set(null)}
          ></button>
        {/if}
        {#each g.items as p (p.hex)}
          <button
            type="button"
            class="opt-tile tint-swatch"
            class:tint-gray={p.gray}
            class:selected={current === p.hex}
            style:--h={p.h}
            style:--k={p.k}
            style:--c={p.hex}
            aria-pressed={current === p.hex}
            aria-label="Usar {p.name}"
            data-tip={p.name}
            onclick={() => tint.set(p.hex)}
          ></button>
        {/each}
      </div>
    </div>
  {/each}
  <ColorPicker bind:value={() => tint.value ?? "", (c) => tint.set(c || null)} label="Color" presets={false} placeholder="Por defecto" />
</div>

<style>
  .tint-picker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-14);
  }

  .tint-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }

  .tint-label {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
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

  /* En el estilo sólido, el acento que daría cada uno: el color tal cual
     (ver styles/solido.css). */
  :global(:root[data-estilo="solido"]) .tint-swatch {
    background: var(--c) border-box;
  }

  :global(:root[data-estilo="solido"]) .tint-default {
    background: light-dark(oklch(0.57 0.2 262), oklch(0.66 0.19 262)) border-box;
  }

  :global(:root[data-estilo="solido"]) .tint-gray {
    background: var(--text-primary) border-box;
  }

  /* En el teléfono, algo más chicos: caben más por fila. */
  @media (max-width: 40rem) {
    .tint-options {
      gap: var(--sp-8);
    }

    .tint-swatch {
      width: 2.375rem;
      height: 2.375rem;
    }
  }
</style>
