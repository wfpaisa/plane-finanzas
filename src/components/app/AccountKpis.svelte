<!--
  Las cifras de las cuentas: saldo neto, lo reservado, lo disponible y las
  deudas (si hay). Van sueltas, para ponerlas en la fila de cifras de cada
  pantalla (Cuentas y el Resumen). "Ver para qué" abre el desglose de lo
  reservado en todas las cuentas.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { InfoTip } from "../ui";
  import { accountAvailability } from "../../lib/cards";
  import { BALANCE_TIPS } from "../../lib/labels";
  import { store } from "../../lib/store.svelte";
  import EarmarkedModal from "./EarmarkedModal.svelte";
  import Money from "./Money.svelte";

  let earmarkOpen = $state(false);

  const counted = $derived(store.activeAccounts.filter((a) => !a.exclude_from_total));
  // Solo lo reservado en las cuentas que suman en el total: así el total es
  // lo reservado más lo que queda sin reservar.
  const earmarked = $derived(counted.reduce((s, a) => s + store.earmarked(a.id), 0));
  const availability = $derived(accountAvailability(store.activeAccounts, (id) => store.balance(id), earmarked));
  // Una deuda de centavos (lo que dejan las sumas con decimales) se vería como $0.
  const hasDebt = $derived(Math.round(availability.debt) > 0);
</script>

<div class="card kpi">
  <div class="kpi-head">
    <span class="kpi-ico"><Icon name="wallet-01" /></span><span class="kpi-label"
      ><span class="label-tip">Saldo neto<InfoTip text={BALANCE_TIPS.total} /></span></span
    >
  </div>
  <div class="kpi-val"><Money value={store.total} /></div>
</div>
<div class="card kpi">
  <div class="kpi-head">
    <span class="kpi-ico"><Icon name="piggy-bank" /></span><span class="kpi-label"
      ><span class="label-tip">Reservado<InfoTip text={BALANCE_TIPS.earmarked} /></span></span
    >
  </div>
  <div class="kpi-val"><Money value={earmarked} /></div>
  {#if earmarked > 0}<button type="button" class="link small ak-link" onclick={() => (earmarkOpen = true)}>Ver para qué →</button>{/if}
</div>
<div class="card kpi">
  <div class="kpi-head">
    <span class="kpi-ico tone-income"><Icon name="coins-01" /></span><span class="kpi-label"
      ><span class="label-tip">Disponible<InfoTip text={BALANCE_TIPS.available} /></span></span
    >
  </div>
  <div class="kpi-val"><Money value={availability.available} tone={availability.available < 0 ? "expense" : undefined} /></div>
  {#if hasDebt}
    <p class="ak-before">Antes de deudas: <Money value={availability.beforeDebts} /></p>
  {/if}
</div>
{#if hasDebt}
  <div class="card kpi">
    <div class="kpi-head">
      <span class="kpi-ico tone-expense"><Icon name="credit-card" /></span><span class="kpi-label"
        ><span class="label-tip">Deudas<InfoTip text="Lo que debes en tarjetas de crédito y otras deudas: la suma de los saldos negativos." /></span></span
      >
    </div>
    <div class="kpi-val"><Money value={availability.debt} tone="expense" /></div>
  </div>
{/if}

<EarmarkedModal open={earmarkOpen} account={null} accounts={counted} onClose={() => (earmarkOpen = false)} />

<style>
  .ak-before {
    margin: var(--sp-4) 0 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .ak-link {
    align-self: flex-start;
  }
</style>
