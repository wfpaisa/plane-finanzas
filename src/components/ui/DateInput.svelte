<!--
  Un campo de fecha: se escribe año/mes/día ("2026/09/22") o se elige en el
  calendario que se abre al tocarlo. El valor es "AAAA-MM-DD" ("" sin fecha).

  Reemplaza al `<input type="date">` del navegador, que escribe la fecha en
  el orden y el idioma del sistema.
-->
<script lang="ts">
  import { cx } from "../../lib/cx";
  import { dateYmd, parseYmd } from "../../lib/format";
  import Icon from "../Icon.svelte";
  import Calendar from "./Calendar.svelte";
  import Dropdown from "./Dropdown.svelte";

  let {
    value = $bindable(""),
    clearable = false,
    disabled = false,
    placeholder = "AAAA/MM/DD",
    class: className,
    "aria-label": ariaLabel,
  }: {
    value?: string;
    /** Con una x para dejarla sin fecha (en los campos opcionales). */
    clearable?: boolean;
    disabled?: boolean;
    placeholder?: string;
    class?: string;
    "aria-label"?: string;
  } = $props();

  // Lo escrito: mientras no sea una fecha completa, se deja como está.
  let text = $state(dateYmd(value));
  $effect(() => {
    const shown = dateYmd(value);
    if (parseYmd(text) !== (value || null)) text = shown;
  });

  function typed(next: string) {
    text = next;
    const d = parseYmd(next);
    if (d) value = d;
    else if (!next.trim() && clearable) value = "";
  }
</script>

<Dropdown class="date-menu" wrapClass={cx("date-wrap", className)}>
  {#snippet trigger({ open, toggle })}
    <span class="date-field">
      <input
        type="text"
        class="field-control w-full date-text"
        inputmode="numeric"
        autocomplete="off"
        aria-label={ariaLabel}
        {placeholder}
        {disabled}
        value={text}
        oninput={(e) => typed(e.currentTarget.value)}
        onblur={() => (text = dateYmd(value))}
        onclick={() => !open && toggle()}
        onkeydown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
      />
      {#if clearable && value && !disabled}
        <button type="button" class="date-clear" aria-label="Quitar la fecha" onclick={() => ((value = ""), (text = ""))}>
          <Icon name="cancel-01" size={14} />
        </button>
      {:else}
        <button type="button" class="date-icon" tabindex="-1" aria-label="Abrir calendario" aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={toggle}>
          <Icon name="calendar-03" size={16} />
        </button>
      {/if}
    </span>
  {/snippet}
  {#snippet children(close)}
    <Calendar
      mode="day"
      {value}
      onpick={(d) => {
        value = d;
        text = dateYmd(d);
        close();
      }}
    />
  {/snippet}
</Dropdown>

<style>
  :global(.date-wrap) {
    display: flex;
  }

  .date-field {
    position: relative;
    display: flex;
    width: 100%;
  }

  .date-text {
    padding-right: 2.25rem;
    font-variant-numeric: tabular-nums;
  }

  .date-icon,
  .date-clear {
    position: absolute;
    top: 50%;
    right: 0.35rem;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm, 0.5rem);
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    translate: 0 -50%;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  :global(.date-menu) {
    width: 18.5rem;
    padding: var(--sp-8);
  }
</style>
