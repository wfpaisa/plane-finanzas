<!--
  Un ícono ⓘ junto a una etiqueta, con la explicación en un tooltip. Es un
  botón para que se pueda enfocar con el teclado o tocar en el celular: el
  tooltip sale también al enfocarlo. Dentro de un <label> no activa el campo.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";

  let { text }: { text: string } = $props();
</script>

<button type="button" class="info-tip" data-tip={text} data-tip-tap aria-label={text}><Icon name="information-circle" size={13} /></button>

<style>
  .info-tip {
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    cursor: help;
    border-radius: 50%;
    outline-offset: 2px;

    &:hover,
    &:focus-visible {
      color: var(--text-primary);
    }
  }
</style>
