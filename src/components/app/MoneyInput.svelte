<!--
  Campo de dinero: se escribe con los puntos de miles puestos ("9.917.228")
  y por fuera entrega un número.
-->
<script lang="ts">
  import { plainNumber } from "../../lib/format";

  let {
    value = $bindable(0),
    id,
    placeholder = "0",
    autofocus = false,
    allowNegative = false,
  }: {
    value?: number;
    id?: string;
    placeholder?: string;
    autofocus?: boolean;
    allowNegative?: boolean;
  } = $props();

  const show = (n: number) => (n ? (n < 0 ? "-" : "") + plainNumber(Math.abs(n)) : "");

  let text = $state(show(value));
  let last = value;

  // Si el valor cambia desde fuera (un formulario que se rellena), se refleja.
  $effect(() => {
    if (value !== last) {
      last = value;
      text = show(value);
    }
  });

  function oninput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    const neg = allowNegative && raw.trim().startsWith("-");
    const digits = raw.replace(/\D/g, "");
    const n = digits ? Number(digits) * (neg ? -1 : 1) : 0;
    last = n;
    value = n;
    text = digits ? (neg ? "-" : "") + plainNumber(Math.abs(n)) : neg ? "-" : "";
  }
</script>

<div class="money-input">
  <span class="money-input-prefix">$</span>
  <!-- svelte-ignore a11y_autofocus -->
  <input
    {id}
    {autofocus}
    class="field-control w-full"
    inputmode={allowNegative ? "text" : "numeric"}
    {placeholder}
    value={text}
    {oninput}
  />
</div>

<style>
  .money-input {
    position: relative;

    & input {
      padding-left: 1.6rem;
      font-family: var(--font-num);
      font-variant-numeric: tabular-nums;
    }
  }

  .money-input-prefix {
    position: absolute;
    left: 0.65rem;
    top: 50%;
    translate: 0 -50%;
    color: var(--text-muted);
    font-size: var(--text-sm);
    pointer-events: none;
    z-index: 1;
  }
</style>
