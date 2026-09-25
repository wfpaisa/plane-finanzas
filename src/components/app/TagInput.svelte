<!--
  Etiquetas libres: se escribe y Enter (o coma) la agrega. Cada etiqueta
  tiene siempre el mismo color (`tintFor`).
-->
<script lang="ts">
  import { tintFor } from "../../lib/palettes";
  import Tag, { type Tone } from "../ui/Tag.svelte";

  let {
    value = $bindable([]),
    suggestions = [],
  }: { value?: string[]; suggestions?: string[] } = $props();

  let text = $state("");

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/,/g, "");
    if (t && !value.includes(t)) value = [...value, t];
    text = "";
  }

  const offer = $derived(
    suggestions.filter((s) => !value.includes(s) && (!text || s.includes(text.toLowerCase()))).slice(0, 8),
  );
</script>

<div class="tag-input">
  <div class="tag-input-row field-control">
    {#each value as t (t)}
      <Tag tone={tintFor(t) as Tone} onRemove={() => (value = value.filter((x) => x !== t))}>#{t}</Tag>
    {/each}
    <input
      bind:value={text}
      placeholder={value.length ? "" : "viaje, trabajo, casa…"}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          add(text);
        } else if (e.key === "Backspace" && !text && value.length) {
          value = value.slice(0, -1);
        }
      }}
      onblur={() => text && add(text)}
    />
  </div>
  {#if offer.length}
    <div class="tag-offer">
      {#each offer as s (s)}
        <Tag tone="off" onclick={() => add(s)}>+ {s}</Tag>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-input-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
    height: auto;
    min-height: 2.25rem;
    padding-block: var(--sp-4);

    /* El input va suelto dentro de la caja, que ya es el campo: sin el
       vestido que le pone `.field` a todo input (fondo, filo, sombra). */
    & input,
    & input:focus {
      flex: 1;
      min-width: 6rem;
      height: auto;
      padding: 0;
      border: 0;
      border-radius: 0;
      outline: 0;
      background: transparent;
      box-shadow: none;
      color: inherit;
      font: inherit;
    }
  }

  .tag-offer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
    margin-top: var(--sp-6);
  }
</style>
