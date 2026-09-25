<!-- ‹ sept 2026 › — o solo el año. -->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { addMonths } from "../../lib/finance";
  import { monthLabel } from "../../lib/format";

  let { ym = $bindable(), yearly = false }: { ym: string; yearly?: boolean } = $props();

  const step = $derived(yearly ? 12 : 1);
</script>

<div class="mn">
  <button type="button" class="btn-icon sm" aria-label={yearly ? "Año anterior" : "Mes anterior"} onclick={() => (ym = addMonths(ym, -step))}>
    <Icon name="arrow-left-01" size={20} />
  </button>
  <span>{yearly ? ym.slice(0, 4) : monthLabel(ym)}</span>
  <button type="button" class="btn-icon sm" aria-label={yearly ? "Año siguiente" : "Mes siguiente"} onclick={() => (ym = addMonths(ym, step))}>
    <Icon name="arrow-right-01" size={20} />
  </button>
</div>

<style>
  .mn {
    display: flex;
    align-items: center;
    gap: var(--sp-2, 0.125rem);

    & span {
      min-width: 5.5rem;
      font-weight: 600;
      text-align: center;
    }
  }
</style>
