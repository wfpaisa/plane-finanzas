<!--
  Cuentas: cuánto hay en cada una, en dos tablas (las cuentas y las tarjetas
  de crédito, con su cupo y lo que se debe), y el reparto del total en un
  flujo. Clic derecho en una fila la marca para sumarla (Mayús + clic derecho
  marca el tramo desde la última tocada).
-->
<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import AccountForm from "../components/app/AccountForm.svelte";
  import AccountKpis from "../components/app/AccountKpis.svelte";
  import ColorDot from "../components/app/ColorDot.svelte";
  import EarmarkedModal from "../components/app/EarmarkedModal.svelte";
  import Money from "../components/app/Money.svelte";
  import PickBar from "../components/app/PickBar.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, InfoTip, Switch } from "../components/ui";
  import { band, flowLayout } from "../lib/analysis";
  import { cardCredit, isCard } from "../lib/cards";
  import { accountTypeIcon, accountTypeLabel, BALANCE_TIPS } from "../lib/labels";
  import { colorOf } from "../lib/palettes";
  import { go } from "../lib/router.svelte";
  import { store } from "../lib/store.svelte";
  import type { Account } from "../lib/types";

  let editing = $state<Account | null>(null);
  let formOpen = $state(false);
  let showArchived = $state(false);
  // El desglose de lo reservado: una cuenta, o todas.
  let earmarkOpen = $state(false);
  let earmarkAccount = $state<Account | null>(null);

  function showEarmarked(a: Account | null) {
    earmarkAccount = a;
    earmarkOpen = true;
  }

  const list = $derived(store.accounts.filter((a) => showArchived || !a.archived));
  const accounts = $derived(list.filter((a) => !isCard(a)));
  const creditAccounts = $derived(list.filter(isCard));
  const visibleOrder = $derived([...accounts, ...creditAccounts]);
  const counted = $derived(store.activeAccounts.filter((a) => !a.exclude_from_total));
  const positives = $derived(counted.filter((a) => store.balance(a.id) > 0));
  const debts = $derived(counted.filter((a) => store.balance(a.id) < 0).reduce((s, a) => s + store.balance(a.id), 0));
  const credit = (a: Account) => cardCredit(a, store.balance(a.id));

  // Lo marcado para sumar. Solo cuenta lo que está a la vista: si se
  // esconden las archivadas, salen de la suma sin perder la marca.
  const selected = new SvelteSet<string>();
  const picked = $derived(visibleOrder.filter((a) => selected.has(a.id)));
  const pickedBalance = $derived(picked.reduce((s, a) => s + store.balance(a.id), 0));
  const pickedSaved = $derived(picked.reduce((s, a) => s + store.earmarked(a.id), 0));
  let anchor: string | null = null;

  function toggle(a: Account, e: MouseEvent) {
    e.preventDefault();
    const on = !selected.has(a.id);
    if (e.shiftKey && anchor) {
      const ids = visibleOrder.map((x) => x.id);
      const [i, j] = [ids.indexOf(anchor), ids.indexOf(a.id)].sort((x, y) => x - y);
      if (i >= 0)
        for (const id of ids.slice(i, j + 1)) {
          if (on) selected.add(id);
          else selected.delete(id);
        }
    } else if (on) selected.add(a.id);
    else selected.delete(a.id);
    anchor = a.id;
  }

  function open(a: Account | null) {
    editing = a;
    formOpen = true;
  }

  // Las cuentas a la izquierda, cada una del grueso de su saldo, y todas se
  // juntan a la derecha en el total. Solo las que tienen saldo a favor: una
  // deuda no aporta dinero, se resta aparte.
  const FLOW_W = 1000;
  const NODE = 12;
  const sorted = $derived([...positives].sort((a, b) => store.balance(b.id) - store.balance(a.id)));
  const FLOW_H = $derived(Math.max(240, sorted.length * 56));
  const flow = $derived(
    flowLayout(
      [],
      sorted.map((a) => ({ id: a.id, label: a.name, value: store.balance(a.id), tint: colorOf(a.palette) })),
      FLOW_H,
      6,
      40,
    ),
  );
  const positiveTotal = $derived(flow.total);
</script>

{#snippet accountTable(rows: Account[], title: string, cards = false)}
  {@const balanceTotal = rows.reduce((sum, a) => sum + (cards ? credit(a).limit : store.balance(a.id)), 0)}
  {@const savedTotal = rows.reduce((sum, a) => sum + store.earmarked(a.id), 0)}
  {@const owedTotal = rows.reduce((sum, a) => sum + credit(a).owed, 0)}
  {@const freeTotal = cards ? rows.reduce((sum, a) => sum + (credit(a).limit ? credit(a).available : 0), 0) : balanceTotal - savedTotal}
  <section class="acc-table-wrap card">
    <h2 class="acc-group-title">{title}</h2>
    <table class="acc-table">
      <thead>
        <tr>
          <th>Cuenta</th>
          <th>Tipo</th>
          <th>Banco</th>
          {#if !cards}<th class="num"><span class="label-tip">Reservado<InfoTip text={BALANCE_TIPS.earmarked} /></span></th>{/if}
          <th class="num"
            ><span class="label-tip">{cards ? "Cupo" : "Saldo"}<InfoTip text={cards ? BALANCE_TIPS.limit : BALANCE_TIPS.balance} /></span></th
          >
          {#if cards}<th class="num"><span class="label-tip">Debes<InfoTip text={BALANCE_TIPS.owed} /></span></th>{/if}
          <th class="num"
            ><span class="label-tip">Disponible<InfoTip text={cards ? BALANCE_TIPS.cardFree : BALANCE_TIPS.free} /></span></th
          >
          <th><span class="sr-only">Movimientos</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as a (a.id)}
          {@const c = credit(a)}
          {@const balance = store.balance(a.id)}
          {@const saved = store.earmarked(a.id)}
          {@const available = cards ? c.available : balance - saved}
          <!-- La fila entera abre la cuenta; con teclado, el botón del
               nombre (su clic sube hasta la fila). -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <tr
            class:acc-selected={selected.has(a.id)}
            class:acc-archived={a.archived}
            onclick={() => open(a)}
            oncontextmenu={(e) => toggle(a, e)}
          >
            <td class="acc-name">
              <span class="acc-ico"><Icon name={a.icon || accountTypeIcon(a.type)} size={15} /></span>
              <button type="button" aria-pressed={selected.has(a.id)}>{a.name}</button>
              <ColorDot color={a.palette} />
              {#if a.exclude_from_total}<span class="acc-note" data-tip="No suma en el saldo neto"
                  ><Icon name="calculator-01" size={13} /></span
                >{/if}
            </td>
            <td class="acc-cell">{accountTypeLabel(a.type)}</td>
            <td class="acc-cell">{a.bank || "—"}</td>
            {#if !cards}<td class="num acc-cell">
                {#if saved > 0}
                  <button
                    type="button"
                    class="acc-saved"
                    data-tip="Ver para qué está reservado"
                    onclick={(e) => {
                      e.stopPropagation();
                      showEarmarked(a);
                    }}><Money value={saved} copy={false} /></button
                  >
                {:else}—{/if}
              </td>
            {/if}
            {#if cards}
              <td class="num">{#if c.limit}<Money value={c.limit} />{:else}<span class="acc-cell" data-tip="Agrega el cupo al editar la tarjeta">—</span>{/if}</td>
              <td class="num">{#if c.owed}<Money value={c.owed} tone="expense" />{:else}—{/if}</td>
            {:else}
              <td class="num"><Money value={balance} tone={balance < 0 ? "expense" : undefined} /></td>
            {/if}
            <!-- Sin reservas es el mismo saldo: se ve más suave para no repetirlo. -->
            <td class="num acc-free" class:same={!cards && !saved}>
              {#if cards && !c.limit}—{:else}<Money value={available} tone={available < 0 ? "expense" : undefined} />{/if}
            </td>
            <td class="acc-go">
              <button
                type="button"
                class="link small"
                onclick={(e) => {
                  e.stopPropagation();
                  go("/movimientos", { cuenta: a.id, mes: "todo" });
                }}>Movimientos →</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">{rows.length} {rows.length === 1 ? (cards ? "tarjeta" : "cuenta") : cards ? "tarjetas" : "cuentas"}</td>
          {#if !cards}<td class="num"><Money value={savedTotal} /></td>{/if}
          <td class="num"><Money value={balanceTotal} tone={balanceTotal < 0 ? "expense" : undefined} /></td>
          {#if cards}<td class="num"><Money value={owedTotal} tone="expense" /></td>{/if}
          <td class="num"><Money value={freeTotal} tone={freeTotal < 0 ? "expense" : undefined} /></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </section>
{/snippet}

<div class="page">
  <header class="page-head">
    <div>
      <h1>Cuentas</h1>
      <p>Tu saldo neto, después de restar las deudas, es <b><Money value={store.total} /></b></p>
    </div>
    <div class="page-actions">
      <Switch bind:checked={showArchived} label="Ver archivadas" />
      <Button variant="secondary" onclick={() => open(null)}><Icon name="add-01" />Nueva cuenta</Button>
    </div>
  </header>

  <div class="stack">
    <div class="kpis-auto"><AccountKpis /></div>

    {#if list.length}
      {#if accounts.length}
        {@render accountTable(accounts, "Cuentas")}
      {/if}
      {#if creditAccounts.length}
        {@render accountTable(creditAccounts, "Tarjetas de crédito", true)}
      {/if}
      <p class="acc-hint small">
        <Icon name="mouse-right-click-01" size={14} />Haz clic derecho en una cuenta para seleccionarla y ver la suma de sus saldos
      </p>
    {:else}
      <button type="button" class="add-account" onclick={() => open(null)}>
        <Icon name="add-circle" size={24} />Agregar cuenta
      </button>
    {/if}

    {#if positives.length > 1}
      <div class="card">
        <div class="card-head"><div><h3 class="card-title">Cuánto dinero hay en cada cuenta</h3></div></div>
        <div class="card-body">
          <div class="aflow" style:height="{FLOW_H}px">
            <div class="aflow-labels left">
              {#each flow.right as n (n.id)}
                <div class="aflow-label" style:--seg={n.tint} style:top="{((n.y + n.h / 2) / FLOW_H) * 100}%">
                  <span class="aflow-name">{n.label} · {Math.round((n.value / positiveTotal) * 100)}%</span>
                  <span class="aflow-amount"><Money value={n.value} /></span>
                </div>
              {/each}
            </div>
            <svg viewBox="0 0 {FLOW_W} {FLOW_H}" preserveAspectRatio="none" role="img" aria-label="Saldo de cada cuenta y su total">
              {#each flow.right as n (n.id)}
                <path class="aflow-band" style:--seg={n.tint} d={band(NODE, n.y, n.h, FLOW_W - NODE, n.my, n.mh)} />
                <rect class="aflow-node" style:--seg={n.tint} x="0" y={n.y} width={NODE} height={n.h} rx="3" />
              {/each}
              <rect class="aflow-total" x={FLOW_W - NODE} y="0" width={NODE} height={FLOW_H} rx="3" />
            </svg>
            <div class="aflow-labels right">
              <div class="aflow-label main" style="top: 50%">
                <span class="aflow-name">Dinero en tus cuentas</span>
                <span class="aflow-amount"><Money value={positiveTotal} /></span>
                {#if debts < 0}
                  <span class="aflow-sub">Deudas <Money value={debts} /></span>
                  <span class="aflow-sub">Saldo neto <Money value={store.total} /></span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if picked.length}
    <PickBar
      count={picked.length}
      onAll={picked.length < visibleOrder.length ? () => visibleOrder.forEach((a) => selected.add(a.id)) : undefined}
      onClear={() => selected.clear()}
    >
      <span>Saldo <Money value={pickedBalance} tone={pickedBalance < 0 ? "expense" : undefined} /></span>
      {#if pickedSaved}
        <span>Reservado <Money value={pickedSaved} /></span>
        <span>Disponible <Money value={pickedBalance - pickedSaved} /></span>
      {/if}
    </PickBar>
  {/if}
</div>

<AccountForm open={formOpen} account={editing} onClose={() => (formOpen = false)} />
<EarmarkedModal open={earmarkOpen} account={earmarkAccount} accounts={counted} onClose={() => (earmarkOpen = false)} />

<style>
  /* El flujo de las cuentas al total: el SVG se estira a lo ancho y las
     etiquetas van encima en HTML, como en el plan de Gastos e ingresos. */
  .aflow {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 2.6fr) minmax(0, 1.4fr);
    gap: var(--sp-12);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.8fr) minmax(0, 1fr);
      gap: var(--sp-6);
    }

    & svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .aflow-labels {
    position: relative;

    &.left .aflow-label {
      right: 0;
      align-items: flex-end;
      text-align: right;
    }

    &.right .aflow-label {
      left: 0;
    }
  }

  .aflow-label {
    position: absolute;
    display: flex;
    flex-direction: column;
    max-width: 100%;
    transform: translateY(-50%);

    &.main .aflow-amount {
      font-size: 1.625rem;
      line-height: 1.15;
    }
  }

  .aflow-name,
  .aflow-sub {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .aflow-amount {
    font-family: var(--font-num);
    font-size: 1rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .aflow-node {
    fill: var(--seg);
  }

  .aflow-band {
    fill: var(--seg);
    opacity: 0.28;
  }

  .aflow-total {
    fill: var(--text-muted);
  }

  .acc-free :global(.money) {
    font-weight: 600;
  }

  .acc-free.same {
    opacity: 0.55;
  }

  /* El total apartado se abre en su desglose: se ve como enlace. */
  .acc-saved {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 3px;

    &:hover {
      color: var(--accent);
    }
  }

  /* En angosto la tabla se desliza de lado dentro de su tarjeta. Lo que va
     en posición absoluta dentro (el texto para lectores de pantalla) se ancla
     aquí: si no, se sale de la tarjeta y ensancha toda la página. */
  .acc-table-wrap {
    position: relative;
    padding: 0;
    overflow-x: auto;
  }

  .acc-group-title {
    margin: 0;
    padding: var(--sp-12);
    border-bottom: var(--border-width) solid var(--border);
    font-size: var(--text-base);
  }

  .acc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);

    & th {
      padding: var(--sp-8) var(--sp-12);
      border-bottom: var(--border-width) solid var(--border);
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: 600;
      text-align: left;
      white-space: nowrap;
    }

    & td {
      padding: var(--sp-8) var(--sp-12);
      white-space: nowrap;
    }

    & tbody tr {
      cursor: pointer;

      &:nth-child(even) {
        background: color-mix(in oklab, var(--text-primary) 0.3%, transparent);
      }

      &:hover {
        background: var(--bg-hover);
      }

      & + tr td {
        border-top: var(--border-width) solid var(--border);
      }

      &.acc-archived {
        opacity: 0.55;
      }

      /* Marcada para sumar: un lavado del acento y su filo a la izquierda. */
      &.acc-selected {
        background: color-mix(in oklab, var(--accent) 12%, transparent);
        box-shadow: inset 3px 0 0 var(--accent);
      }
    }

    & tfoot td {
      padding: var(--sp-10) var(--sp-12);
      border-top: var(--border-width) solid var(--border);
      background: var(--bg-field);
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: 600;
    }

    & .num {
      text-align: right;

      & :global(.money) {
        font-weight: 600;
      }
    }
  }

  /* El nombre toma el ancho sobrante; en angosto no baja de 12rem. */
  .acc-name {
    width: 100%;
    min-width: 12rem;

    & > * {
      vertical-align: middle;
    }

    & button {
      margin: 0 var(--sp-6) 0 var(--sp-10);
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-primary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
  }

  .acc-ico {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    background: var(--bg-field);
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .acc-note {
    display: inline-flex;
    margin-left: var(--sp-6);
    color: var(--text-muted);
  }

  .acc-cell {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .acc-go {
    text-align: right;
  }

  .acc-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin: calc(-1 * var(--sp-8)) 0 0;
    color: var(--text-subtle);
  }

  .add-account {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-8);
    min-height: 9rem;
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-weight: 600;
    cursor: pointer;

    &:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
  }
</style>
