<!--
  Un importe en pesos. `tone` lo colorea por lo que significa: verde lo que
  entra, rojo lo que sale, azul lo que se mueve entre cuentas. Con tono no
  lleva "+" ni "−": lo dice el color. Sin tono, en la tinta del texto, y un
  negativo sí lleva su "−" (una deuda, por ejemplo).
-->
<script lang="ts">
  import { cx } from "../../lib/cx";
  import { money } from "../../lib/format";

  let {
    value,
    tone,
    class: className,
  }: {
    value: number;
    tone?: "income" | "expense" | "transfer" | "auto";
    class?: string;
  } = $props();

  const resolved = $derived(tone === "auto" ? (value < 0 ? "expense" : value > 0 ? "income" : undefined) : tone);
  const text = $derived(money(Math.abs(value)));
</script>

<span class={cx("money", resolved && `money-${resolved}`, className)}
  >{!resolved && value < 0 ? "−" : ""}{text}</span
>

<style>
  .money {
    font-family: var(--font-num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
