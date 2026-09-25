<!--
  Las cuentas agrupadas por tipo, con lo que se tiene (capital), lo que se
  debe y el balance. Las tarjetas y créditos en negativo son deuda. Tocar
  una cuenta abre sus movimientos.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import TopBar from "./TopBar.svelte";
  import { ACCOUNT_TYPES } from "../../lib/labels";
  import { colorOf } from "../../lib/palettes";
  import { store } from "../../lib/store.svelte";

  let { onPick }: { onPick: (accountId: string) => void } = $props();

  const counted = $derived(store.activeAccounts.filter((a) => !a.exclude_from_total));
  const capital = $derived(counted.reduce((s, a) => s + Math.max(0, store.balance(a.id)), 0));
  const debt = $derived(counted.reduce((s, a) => s + Math.max(0, -store.balance(a.id)), 0));

  const groups = $derived(
    ACCOUNT_TYPES.map((t) => {
      const list = store.activeAccounts.filter((a) => (a.type || "otro") === t.id);
      const total = list.filter((a) => !a.exclude_from_total).reduce((s, a) => s + store.balance(a.id), 0);
      return { ...t, list, total };
    }).filter((g) => g.list.length),
  );
</script>

<TopBar>
  <span>Cuentas</span>
  {#snippet actions()}
    <a href="#/cuentas" class="btn-icon sm" aria-label="Administrar cuentas">
      <Icon name="settings-01" size={18} />
    </a>
  {/snippet}
</TopBar>

<div class="ac-sum">
  <div><span>Capital</span><Money value={capital} tone="income" /></div>
  <div><span>A deber</span><Money value={debt} tone="expense" /></div>
  <div><span>Balance</span><Money value={capital - debt} /></div>
</div>

{#each groups as g (g.id)}
  <section class="ac-group">
    <header>
      <span>{g.label}</span>
      <Money value={g.total} tone={g.total < 0 ? "expense" : "income"} />
    </header>
    <ul>
      {#each g.list as a (a.id)}
        {@const bal = store.balance(a.id)}
        <li>
          <button type="button" onclick={() => onPick(a.id)}>
            <i class="ac-dot" style:--c={colorOf(a.palette)}></i>
            <span class="ac-name">
              {a.name}
              {#if a.exclude_from_total}<small>No suma al total</small>{/if}
            </span>
            {#if bal < 0}
              <Money value={bal} tone="expense" />
            {:else}
              <Money value={bal} tone={bal > 0 ? "income" : undefined} />
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="ac-empty">Todavía no tienes cuentas. <a href="#/cuentas">Crea la primera</a>.</p>
{/each}

<style>
  .ac-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: var(--sp-12) var(--sp-8);
    border-bottom: 1px solid var(--border);
    text-align: center;

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    & span:first-child {
      font-size: var(--text-sm);
    }

    & :global(.money) {
      font-size: var(--text-sm);
    }
  }

  .ac-group {
    border-top: 0.5rem solid var(--bg-hover);

    & header {
      display: flex;
      justify-content: space-between;
      padding: var(--sp-14, 0.875rem) var(--sp-16) var(--sp-10);
      border-bottom: 1px solid var(--border);
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    & ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    & button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sp-10);
      width: 100%;
      padding: var(--sp-14, 0.875rem) var(--sp-16);
      border: 0;
      border-bottom: 1px solid var(--border);
      background: none;
      font: inherit;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;

      &:active {
        background: var(--bg-hover);
      }
    }
  }

  .ac-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--c);
  }

  .ac-name {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    & small {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .ac-empty {
    padding: var(--sp-40) var(--sp-16);
    color: var(--text-muted);
    text-align: center;
  }
</style>
