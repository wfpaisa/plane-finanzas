<!-- Selector de pocas opciones: los `.chips` del catálogo, con la pastilla que viaja. -->
<script lang="ts" generics="T extends string">
  import Icon from "../Icon.svelte";

  let {
    value = $bindable(),
    options,
    onchange,
    full = false,
    label,
  }: {
    value: T;
    options: readonly { id: T; label: string; icon?: string }[];
    onchange?: (v: T) => void;
    full?: boolean;
    label?: string;
  } = $props();
</script>

<div class="chips" class:chips-full={full} role="radiogroup" aria-label={label}>
  {#each options as o (o.id)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.id}
      class="chip"
      class:active={value === o.id}
      onclick={() => {
        value = o.id;
        onchange?.(o.id);
      }}
    >
      {#if o.icon}<Icon name={o.icon} />{/if}{o.label}
    </button>
  {/each}
</div>

<style>
  .chips-full {
    width: 100%;
  }
</style>
