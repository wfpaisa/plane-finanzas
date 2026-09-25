<!--
  Lo apartado para ahorros en una cuenta, ahorro por ahorro. Sin `account`,
  el de todas las que suman en el total, cuenta por cuenta.
-->
<script lang="ts">
  import { colorOf } from "../../lib/palettes";
  import { go } from "../../lib/router.svelte";
  import { store } from "../../lib/store.svelte";
  import type { Account } from "../../lib/types";
  import { Button, Modal } from "../ui";
  import ColorDot from "./ColorDot.svelte";
  import Money from "./Money.svelte";

  let {
    open,
    account = null,
    accounts = [],
    onClose,
  }: {
    open: boolean;
    /** Una sola cuenta; sin ella, todas las de `accounts`. */
    account?: Account | null;
    accounts?: Account[];
    onClose: () => void;
  } = $props();

  const groups = $derived(
    (account ? [account] : accounts)
      .map((a) => ({ account: a, items: store.earmarkedBySaving(a.id), total: store.earmarked(a.id) }))
      .filter((g) => g.items.length),
  );
  const total = $derived(groups.reduce((s, g) => s + g.total, 0));
  const balance = $derived(account ? store.balance(account.id) : 0);

  function savingName(id: string) {
    return store.saving(id)?.name ?? "Ahorro de otra persona";
  }
</script>

<Modal
  {open}
  {onClose}
  title={account ? `Para ahorros en ${account.name}` : "Reservado para ahorros"}
  description={account
    ? "Lo que suman los aportes y retiros de cada ahorro hechos en esta cuenta."
    : "Lo que suman los aportes y retiros de cada ahorro, cuenta por cuenta."}
>
  {#if groups.length}
    <div class="em">
      {#each groups as g (g.account.id)}
        <section>
          {#if !account}
            <h4 class="em-acc"><i style:background={colorOf(g.account.palette)}></i>{g.account.name}<Money value={g.total} /></h4>
          {/if}
          <ul>
            {#each g.items as it (it.saving)}
              {@const s = store.saving(it.saving)}
              {@const share = g.total > 0 ? Math.round((it.amount / g.total) * 100) : 0}
              <li>
                <span class="em-name"><ColorDot color={s?.palette} />{savingName(it.saving)}</span>
                <span class="em-bar"><span style:width="{Math.max(0, share)}%" style:background={colorOf(s?.palette)}></span></span>
                <span class="em-pct">{share}%</span>
                <Money value={it.amount} tone={it.amount < 0 ? "expense" : undefined} />
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      <div class="em-total">
        <span>Total para ahorros</span><Money value={total} />
      </div>
      {#if account}
        <div class="em-free">
          <span>Saldo de la cuenta <Money value={balance} /></span>
          <span>Sin reservar <Money value={balance - total} tone={balance - total < 0 ? "expense" : undefined} /></span>
        </div>
      {/if}
    </div>
  {:else}
    <p class="muted small">No hay dinero apartado para ahorros{account ? " en esta cuenta" : ""}.</p>
  {/if}
  {#snippet footer()}
    <Button
      variant="ghost"
      onclick={() => {
        onClose();
        go("/ahorros");
      }}>Ir a Ahorros</Button
    >
    <span class="flex-1"></span>
    <Button variant="secondary" onclick={onClose}>Listo</Button>
  {/snippet}
</Modal>

<style>
  .em {
    display: flex;
    flex-direction: column;
    gap: var(--sp-14);

    & ul {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    & li {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 2.5rem minmax(6.5rem, auto);
      align-items: center;
      gap: var(--sp-10);
      padding: var(--sp-8) 0;
      font-size: var(--text-sm);

      & + li {
        border-top: var(--border-width) solid var(--border);
      }

      & > :global(.money) {
        font-weight: 600;
        text-align: right;
      }
    }
  }

  .em-acc {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    margin: 0 0 var(--sp-4);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-muted);

    & i {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
    }

    & :global(.money) {
      margin-left: auto;
    }
  }

  .em-name {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .em-bar {
    height: 0.375rem;
    border-radius: 99rem;
    background: var(--bg-field);
    overflow: hidden;

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
    }
  }

  .em-pct {
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-align: right;
  }

  .em-total {
    display: flex;
    justify-content: space-between;
    padding-top: var(--sp-10);
    border-top: var(--border-width) solid var(--border);
    font-weight: 600;
  }

  .em-free {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--sp-6) var(--sp-16);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  @media (max-width: 30rem) {
    .em li {
      grid-template-columns: minmax(0, 1fr) auto;

      & .em-bar,
      & .em-pct {
        display: none;
      }
    }
  }
</style>
