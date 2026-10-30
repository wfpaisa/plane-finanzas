<!--
  Un importe en pesos. `tone` lo colorea por lo que significa: verde lo que
  entra, rojo lo que sale, azul lo que se mueve entre cuentas. Con tono no
  lleva "+" ni "−": lo dice el color. Sin tono, en la tinta del texto, y un
  negativo sí lleva su "−" (una deuda, por ejemplo). Un clic, o dejarlo
  presionado en el teléfono, copia sus dígitos (ver App.svelte), salvo con
  `copy={false}`: cuando tocarlo ya hace otra cosa, como abrir un detalle.
-->
<script lang="ts">
  import { cx } from "../../lib/cx";
  import { money } from "../../lib/format";

  let {
    value,
    tone,
    copy = true,
    class: className,
  }: {
    value: number;
    tone?: "income" | "expense" | "transfer" | "auto";
    copy?: boolean;
    class?: string;
  } = $props();

  const resolved = $derived(tone === "auto" ? (value < 0 ? "expense" : value > 0 ? "income" : undefined) : tone);
  const text = $derived(money(Math.abs(value)));
</script>

<span title={copy ? "Copiar monto" : undefined} class={cx("money", copy && "money-copy", resolved && `money-${resolved}`, className)}
  >{!resolved && value < 0 ? "−" : ""}{text}</span
>

<style>
  .money {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Se copia con un clic o dejándolo presionado (ver App.svelte). */
  .money-copy {
    cursor: copy;
  }

  .money-copy:active {
    opacity: 0.6;
  }

  /* Con el dedo, mientras se mantiene presionado: se aclara hasta copiarse. */
  @media (hover: none) {
    .money-copy:active {
      opacity: 1;
    }

    .money-copy:global([data-holding]) {
      opacity: 0.5;
      transition: opacity 400ms ease-out;
    }
  }

  .money-income {
    color: var(--success);
  }

  .money-expense {
    color: var(--danger);
  }

  .money-transfer {
    color: var(--transfer);
  }
</style>
