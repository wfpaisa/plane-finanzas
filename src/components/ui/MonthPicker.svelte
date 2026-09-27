<!--
  Elegir un mes ("AAAA-MM") en español, con el año primero ("2026 · Septiembre").

  El `<input type="month">` del navegador escribe el mes en el idioma del
  sistema ("September 2026") y eso no se cambia con `lang`: por eso un botón
  con el mes y, al abrirlo, el calendario de meses (ver Calendar.svelte).
-->
<script lang="ts">
  import { monthYm } from "../../lib/format";
  import Icon from "../Icon.svelte";
  import Calendar from "./Calendar.svelte";
  import Dropdown from "./Dropdown.svelte";

  let {
    value = $bindable(),
    disabled = false,
  }: {
    value: string;
    disabled?: boolean;
  } = $props();
</script>

<Dropdown class="month-menu">
  {#snippet trigger({ open, toggle })}
    <button type="button" class="field-control sm month-trigger" aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={toggle}
      >{monthYm(value)}<Icon name="calendar-03" size={14} /></button
    >
  {/snippet}
  {#snippet children(close)}
    <Calendar
      mode="month"
      {value}
      onpick={(ym) => {
        value = ym;
        close();
      }}
    />
  {/snippet}
</Dropdown>

<style>
  .month-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    min-width: 10.5rem;
    justify-content: space-between;
    cursor: pointer;
    text-align: left;

    &:disabled {
      cursor: default;
      opacity: 0.5;
    }
  }

  :global(.month-menu) {
    width: 17rem;
    padding: var(--sp-8);
  }
</style>
