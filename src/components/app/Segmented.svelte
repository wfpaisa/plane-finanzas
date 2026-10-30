<!-- Selector de pocas opciones: los `.chips` del catálogo, con la pastilla que viaja.
     Con `tabs` son pestañas de verdad (`.tab-list`): cambian lo que se ve debajo. -->
<script lang="ts" generics="T extends string">
  import Icon from "../Icon.svelte";

  let {
    value = $bindable(),
    options,
    onchange,
    full = false,
    tabs = false,
    label,
  }: {
    value: T;
    /** `sub`: un dato corto junto a la etiqueta, como un total. */
    options: readonly { id: T; label: string; icon?: string; sub?: string }[];
    onchange?: (v: T) => void;
    full?: boolean;
    tabs?: boolean;
    label?: string;
  } = $props();
</script>

<div class={tabs ? "tab-list" : "chips"} class:chips-full={full} role={tabs ? "tablist" : "radiogroup"} aria-label={label}>
  {#each options as o (o.id)}
    <button
      type="button"
      role={tabs ? "tab" : "radio"}
      aria-checked={tabs ? undefined : value === o.id}
      aria-selected={tabs ? value === o.id : undefined}
      class={tabs ? "tab" : "chip"}
      class:active={value === o.id}
      onclick={() => {
        value = o.id;
        onchange?.(o.id);
      }}
    >
      {#if o.icon}<Icon name={o.icon} />{/if}{o.label}{#if o.sub}<span class="seg-sub">{o.sub}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .chips-full {
    width: 100%;
  }

  .seg-sub {
    font-family: var(--font-num, inherit);
    font-weight: 500;
    color: var(--text-muted);
  }
</style>
