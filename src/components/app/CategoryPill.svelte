<!-- La categoría con su color e icono. Sin categoría, una pastilla apagada. -->
<script lang="ts">
  import { store } from "../../lib/store.svelte";
  import Icon from "../Icon.svelte";
  import Tag, { type Tone } from "../ui/Tag.svelte";

  let { id, onclick }: { id: string; onclick?: () => void } = $props();

  const cat = $derived(store.category(id));
</script>

{#if cat}
  <Tag tone={(cat.color || "tint-10") as Tone} {onclick}><Icon name={cat.icon || "tag-01"} />{cat.name}</Tag>
{:else}
  <Tag tone="off" {onclick}>Sin categoría</Tag>
{/if}
