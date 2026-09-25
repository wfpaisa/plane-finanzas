<!--
  Cuentas: cuánto hay en cada una, en una tabla, y el reparto del total en
  una barra. Clic derecho en una fila la marca para sumarla (Mayús + clic
  derecho marca el tramo desde la última tocada).
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { SvelteSet } from "svelte/reactivity";

  import AccountForm from "../components/app/AccountForm.svelte";
  import ColorDot from "../components/app/ColorDot.svelte";
  import Money from "../components/app/Money.svelte";
  import PickBar from "../components/app/PickBar.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Switch } from "../components/ui";
  import { colorsFor, token } from "../lib/colors";
  import { money } from "../lib/format";
  import { accountTypeIcon, accountTypeLabel } from "../lib/labels";
  import { go } from "../lib/router.svelte";
  import { colorOf } from "../lib/palettes";
  import { store } from "../lib/store.svelte";
  import type { Account } from "../lib/types";

  let editing = $state<Account | null>(null);
  let formOpen = $state(false);
  let showArchived = $state(false);

  const list = $derived(store.accounts.filter((a) => showArchived || !a.archived));
  const counted = $derived(store.activeAccounts.filter((a) => !a.exclude_from_total));
  const positives = $derived(counted.filter((a) => store.balance(a.id) > 0));
  const debts = $derived(counted.filter((a) => store.balance(a.id) < 0).reduce((s, a) => s + store.balance(a.id), 0));
  // Solo lo apartado en las cuentas que suman en el total: así el total es
  // lo reservado más lo que queda sin reservar.
  const earmarked = $derived(counted.reduce((s, a) => s + store.earmarked(a.id), 0));

  // Lo marcado para sumar. Solo cuenta lo que está a la vista: si se
  // esconden las archivadas, salen de la suma sin perder la marca.
  const selected = new SvelteSet<string>();
  const picked = $derived(list.filter((a) => selected.has(a.id)));
  const pickedBalance = $derived(picked.reduce((s, a) => s + store.balance(a.id), 0));
  const pickedSaved = $derived(picked.reduce((s, a) => s + store.earmarked(a.id), 0));
  let anchor: string | null = null;

  function toggle(a: Account, e: MouseEvent) {
    e.preventDefault();
    const on = !selected.has(a.id);
    if (e.shiftKey && anchor) {
      const ids = list.map((x) => x.id);
      const [i, j] = [ids.indexOf(anchor), ids.indexOf(a.id)].sort((x, y) => x - y);
      if (i >= 0) for (const id of ids.slice(i, j + 1)) on ? selected.add(id) : selected.delete(id);
    } else if (on) selected.add(a.id);
    else selected.delete(a.id);
    anchor = a.id;
  }

  function open(a: Account | null) {
    editing = a;
    formOpen = true;
  }

  const chartConfig = (): ChartConfiguration => {
    const sorted = [...positives].sort((a, b) => store.balance(b.id) - store.balance(a.id));
    return {
      type: "bar",
      data: {
        labels: sorted.map((a) => a.name),
        datasets: [
          {
            label: "Saldo",
            data: sorted.map((a) => store.balance(a.id)),
            // Cada cuenta en su color.
            backgroundColor: colorsFor(sorted.map((a) => colorOf(a.palette))),
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: "y",
        scales: {
          x: { ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
          y: { grid: { display: false }, ticks: { color: token("--text-secondary") } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${money(Number(c.raw))}` } },
        },
      },
    };
  };
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Cuentas</h1>
      <p>Entre todas tus cuentas tienes <b><Money value={store.total} /></b></p>
    </div>
    <div class="page-actions">
      <Switch bind:checked={showArchived} label="Ver archivadas" />
      <Button variant="secondary" onclick={() => open(null)}><Icon name="add-01" />Nueva cuenta</Button>
    </div>
  </header>

  <div class="stack">
    <div class="kpis-auto">
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico"><Icon name="wallet-01" /></span><span class="kpi-label">Dinero total</span></div>
        <div class="kpi-val"><Money value={store.total} /></div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico"><Icon name="piggy-bank" /></span><span class="kpi-label">Reservado para ahorros</span></div>
        <div class="kpi-val"><Money value={earmarked} /></div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-income"><Icon name="coins-01" /></span><span class="kpi-label">Sin reservar</span></div>
        <div class="kpi-val"><Money value={store.total - earmarked} /></div>
      </div>
      {#if debts < 0}
        <div class="card kpi">
          <div class="kpi-head"><span class="kpi-ico tone-expense"><Icon name="credit-card" /></span><span class="kpi-label">Deudas</span></div>
          <div class="kpi-val"><Money value={debts} tone="expense" /></div>
        </div>
      {/if}
    </div>

    {#if list.length}
      <div class="acc-table-wrap card">
        <table class="acc-table">
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Tipo</th>
              <th>Banco</th>
              <th class="num">Para ahorros</th>
              <th class="num">Saldo</th>
              <th><span class="sr-only">Movimientos</span></th>
            </tr>
          </thead>
          <tbody>
            {#each list as a (a.id)}
              {@const balance = store.balance(a.id)}
              {@const saved = store.earmarked(a.id)}
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
                  {#if a.exclude_from_total}<span class="acc-note" data-tip="No suma en el total"><Icon name="calculator-01" size={13} /></span>{/if}
                </td>
                <td class="acc-cell">{accountTypeLabel(a.type)}</td>
                <td class="acc-cell">{a.bank || "—"}</td>
                <td class="num acc-cell">{#if saved > 0}<Money value={saved} />{:else}—{/if}</td>
                <td class="num"><Money value={balance} tone={balance < 0 ? "expense" : undefined} /></td>
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
              <td colspan="3">{list.length} {list.length === 1 ? "cuenta" : "cuentas"}</td>
              <td class="num"><Money value={earmarked} /></td>
              <td class="num"><Money value={store.total} /></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="acc-hint small"><Icon name="mouse-right-click-01" size={14} />Clic derecho en una cuenta para sumarla</p>
    {:else}
      <button type="button" class="add-account" onclick={() => open(null)}>
        <Icon name="add-circle" size={24} />Agregar cuenta
      </button>
    {/if}

    {#if positives.length > 1}
      <div class="card">
        <div class="card-head"><div><h3 class="card-title">Cuánto dinero hay en cada cuenta</h3></div></div>
        <div class="card-body">
          <Chart config={chartConfig} height={Math.max(160, positives.length * 34)} label="Saldo por cuenta" />
        </div>
      </div>
    {/if}
  </div>

  {#if picked.length}
    <PickBar
      count={picked.length}
      onAll={picked.length < list.length ? () => list.forEach((a) => selected.add(a.id)) : undefined}
      onClear={() => selected.clear()}
    >
      <span>Saldo <Money value={pickedBalance} tone={pickedBalance < 0 ? "expense" : undefined} /></span>
      {#if pickedSaved}
        <span>Para ahorros <Money value={pickedSaved} /></span>
        <span>Sin reservar <Money value={pickedBalance - pickedSaved} /></span>
      {/if}
    </PickBar>
  {/if}
</div>

<AccountForm open={formOpen} account={editing} onClose={() => (formOpen = false)} />

<style>
  /* En angosto la tabla se desliza de lado dentro de su tarjeta. */
  .acc-table-wrap {
    padding: 0;
    overflow-x: auto;
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
