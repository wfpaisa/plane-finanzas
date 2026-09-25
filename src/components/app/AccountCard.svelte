<!--
  La tarjeta de una cuenta: vidrio neutro, saldo grande y un punto con la
  paleta de la cuenta. Debajo, cuánto de ese saldo está apartado en ahorros.
-->
<script lang="ts">
  import { accountTypeIcon, accountTypeLabel } from "../../lib/labels";
  import { store } from "../../lib/store.svelte";
  import type { Account } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import Money from "./Money.svelte";
  import ColorDot from "./ColorDot.svelte";

  let {
    account,
    onclick,
    compact = false,
  }: { account: Account; onclick?: () => void; compact?: boolean } = $props();

  const balance = $derived(store.balance(account.id));
  const saved = $derived(store.earmarked(account.id));
</script>

<button type="button" class="account-card card" class:compact class:archived={account.archived} {onclick}>
  <span class="ac-top">
    <span class="ac-icon"><Icon name={account.icon || accountTypeIcon(account.type)} size={compact ? 15 : 17} /></span>
    <ColorDot color={account.palette} />
  </span>
  <span class="ac-name">{account.name}</span>
  <span class="ac-type">{accountTypeLabel(account.type)}{account.bank ? ` · ${account.bank}` : ""}</span>
  <Money value={balance} tone={balance < 0 ? "expense" : undefined} class="ac-balance" />
  {#if !compact}
    <span class="ac-foot">
      {#if saved > 0}
        <Icon name="piggy-bank" /><Money value={saved} /> apartado
      {:else if account.exclude_from_total}
        No suma en el total
      {/if}
    </span>
  {/if}
</button>

<style>
  .account-card {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    padding: var(--sp-16) var(--sp-18);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition:
      transform 0.2s,
      background 0.2s,
      border-color 0.2s;

    &:hover {
      transform: translateY(-1px);
      border-color: var(--border-strong);
    }

    &.archived {
      opacity: 0.55;
    }

    & :global(.ac-balance) {
      margin-top: var(--sp-10);
      font-size: 1.5rem;
      font-weight: 600;
    }

    &.compact {
      padding: var(--sp-14) var(--sp-16);

      & :global(.ac-balance) {
        margin-top: var(--sp-6);
        font-size: 1.125rem;
      }
    }
  }

  .ac-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-12);

    .compact & {
      margin-bottom: var(--sp-8);
    }
  }

  .ac-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    background: var(--bg-field);
    border: 1px solid var(--border);
    color: var(--text-secondary);

    .compact & {
      width: 1.75rem;
      height: 1.75rem;
    }
  }

  .ac-name {
    overflow: hidden;
    font-weight: 600;
    font-size: var(--text-sm);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .ac-type {
    overflow: hidden;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .ac-foot {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.1rem;
    margin-top: var(--sp-6);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
