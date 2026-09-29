<!--
  Las cuentas agrupadas por tipo, cada tipo en su tarjeta, con lo que se
  tiene (capital), lo que se debe y el balance. Las tarjetas y créditos en negativo son deuda. Tocar
  una cuenta abre sus movimientos.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import BackButton from "./BackButton.svelte";
  import TopBar from "./TopBar.svelte";
  import { ACCOUNT_TYPES, accountTypeIcon } from "../../lib/labels";
  import { colorOf } from "../../lib/palettes";
  import { store } from "../../lib/store.svelte";

  let { onPick, onBack }: { onPick: (accountId: string) => void; onBack?: () => void } = $props();

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

<TopBar brand={!onBack}>
  {#if onBack}<BackButton label="Más" onclick={onBack} />{/if}
  {#snippet actions()}
    <a href="#/m?ver=administrar" class="btn-icon sm" aria-label="Administrar cuentas">
      <Icon name="settings-01" size={18} />
    </a>
  {/snippet}
</TopBar>

<div class="ac">
  <header class="page-head">
    <div>
      <h1>Cuentas</h1>
      <p>El saldo neto de tus cuentas es <b><Money value={store.total} /></b></p>
    </div>
    <a href="#/m?ver=administrar" class="btn sm">Administrar</a>
  </header>

  <div class="card ac-sum">
    <div>
      <span class="ac-sum-label"><span class="kpi-ico tone-income"><Icon name="arrow-up-right-01" size={14} /></span>Saldos positivos</span>
      <Money value={capital} tone="income" />
    </div>
    <div>
      <span class="ac-sum-label"><span class="kpi-ico tone-expense"><Icon name="credit-card" size={14} /></span>Deudas</span>
      <Money value={debt} tone="expense" />
    </div>
    <div>
      <span class="ac-sum-label"><span class="kpi-ico"><Icon name="coins-01" size={14} /></span>Saldo neto</span>
      <Money value={capital - debt} />
    </div>
  </div>

  {#each groups as g (g.id)}
    <section class="card ac-group">
      <header>
        <span class="ac-type"><Icon name={g.icon} size={14} />{g.label}</span>
        <Money value={g.total} tone={g.total < 0 ? "expense" : "income"} />
      </header>
      <ul>
        {#each g.list as a (a.id)}
          {@const bal = store.balance(a.id)}
          <li>
            <button type="button" onclick={() => onPick(a.id)}>
              <span class="ac-ico" style:--c={colorOf(a.palette)}><Icon name={a.icon || accountTypeIcon(a.type)} size={16} /></span>
              <span class="ac-name">
                <span>{a.name}</span>
                <small>
                  {#if a.exclude_from_total}No suma al total{:else}{a.bank || g.label}{/if}
                </small>
              </span>
              {#if bal < 0}
                <Money value={bal} tone="expense" />
              {:else}
                <Money value={bal} tone={bal > 0 ? "income" : undefined} />
              {/if}
              <Icon name="arrow-right-01" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="ac-empty">Todavía no tienes cuentas. <a class="link" href="#/m?ver=administrar">Crea la primera</a>.</p>
  {/each}
</div>

<style>
  .ac {
    padding: var(--sp-16) var(--sp-12) var(--sp-24);

    & > .page-head {
      padding: 0 var(--sp-4);
    }
  }

  .ac-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: var(--sp-12);
    padding: var(--sp-12) var(--sp-4);

    & > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sp-4);
      min-width: 0;
      overflow: hidden;
      padding: 0 var(--sp-6);
    }

    & > div + div {
      border-left: 1px solid var(--border);
    }

    & :global(.money) {
      max-width: 100%;
      overflow: hidden;
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
    }
  }

  .ac-sum-label {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    font-size: var(--text-xs);
    color: var(--text-secondary);

    & .kpi-ico {
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  .ac-group {
    margin-bottom: var(--sp-12);
    overflow: hidden;

    & header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-8);
      padding: var(--sp-12) var(--sp-16) var(--sp-10);
      border-bottom: 1px solid var(--border);
      font-size: var(--text-xs);
      color: var(--text-secondary);

      & :global(.money) {
        font-size: var(--text-sm);
        font-weight: 600;
      }
    }

    & ul {
      margin: 0;
      padding: var(--sp-4) 0;
      list-style: none;
    }

    & li + li button {
      box-shadow: inset 0 1px 0 var(--border);
    }

    & button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      align-items: center;
      gap: var(--sp-12);
      width: 100%;
      min-height: 3.75rem;
      padding: var(--sp-10) var(--sp-12) var(--sp-10) var(--sp-16);
      border: 0;
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;

      &:active {
        background: var(--bg-hover);
      }

      & :global(.money) {
        font-weight: 500;
      }

      & > :global(i:last-child) {
        color: var(--text-muted);
      }
    }
  }

  .ac-type {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    font-weight: 500;
  }

  /* El icono de la cuenta en una almohada, con su color en un punto. */
  .ac-ico {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
    background: var(--bg-field);
    box-shadow: var(--pillow);
    color: var(--text-secondary);

    &::after {
      content: "";
      position: absolute;
      right: -0.125rem;
      bottom: -0.125rem;
      width: 0.625rem;
      height: 0.625rem;
      border: 2px solid var(--bg-level1);
      border-radius: 50%;
      background: var(--c);
    }
  }

  .ac-name {
    display: flex;
    flex-direction: column;
    min-width: 0;

    & > span,
    & small {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    & > span {
      font-weight: 500;
    }

    & small {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .ac-empty {
    padding: var(--sp-40) var(--sp-16);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }
</style>
