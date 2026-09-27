<!-- Volver, con el nombre de a dónde: "‹ Más". Va a la izquierda de la barra
     de arriba en las pantallas que se abren encima de una pestaña. -->
<script lang="ts">
  import Icon from "../Icon.svelte";

  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button type="button" class="back" {onclick}><Icon name="arrow-left-01" size={18} />{label}</button>

<style>
  .back {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-height: 2.75rem;
    padding: 0 var(--sp-12) 0 var(--sp-6);
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:active {
      background: var(--bg-hover);
    }
  }
</style>
