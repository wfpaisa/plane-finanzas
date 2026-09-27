<!--
  Los movimientos agrupados por día, cada día en su tarjeta: arriba el número
  grande, el día de la semana y lo que entró y salió; en cada fila, como en la
  lista de escritorio, el icono de la categoría en su color, la descripción,
  la categoría y la cuenta, y el importe a la derecha.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import Money from "../app/Money.svelte";
  import { accountLine, monthDot, sumOf, weekday, WEEKDAYS_SHORT } from "../../lib/mobile";
  import type { Pending } from "../../lib/outbox";
  import { colorOf } from "../../lib/palettes";
  import { store } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";

  type Tx = Pending<Transaction>;

  let {
    txs,
    onOpen,
    empty = "Sin movimientos.",
    flat = false,
  }: {
    txs: Tx[];
    onOpen: (t: Tx) => void;
    empty?: string;
    /** Sin tarjetas ni cabecera del día: para la hoja de un día, que ya lo dice. */
    flat?: boolean;
  } = $props();

  const days = $derived.by(() => {
    const map = new Map<string, Tx[]>();
    for (const t of txs) {
      const d = t.date.slice(0, 10);
      const day = map.get(d);
      if (day) day.push(t);
      else map.set(d, [t]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  });

  // Lo mismo que la lista de escritorio (ver app/TransactionList.svelte).
  function iconOf(t: Tx) {
    if (t.type === "transfer") return "arrow-data-transfer-horizontal";
    return store.category(t.category)?.icon || (t.type === "income" ? "money-receive-01" : "money-send-01");
  }

  function tintOf(t: Tx) {
    if (t.type === "transfer") return "tint-10";
    return store.category(t.category)?.color || "tint-10";
  }

  function titleOf(t: Tx) {
    if (t.description) return t.description;
    if (t.type === "transfer") return "Transferencia";
    return store.category(t.category)?.name ?? (t.type === "income" ? "Ingreso" : "Gasto");
  }
</script>

{#each days as [day, list] (day)}
  {@const dow = weekday(day)}
  <section class="d-day" class:card={!flat} class:flat>
    {#if !flat}
      <header class="d-head">
        <strong class="d-num">{Number(day.slice(8, 10))}</strong>
        <span class="d-dow" class:sun={dow === 0} class:sat={dow === 6}>{WEEKDAYS_SHORT[dow]}</span>
        <span class="d-month">{monthDot(day)}</span>
        <Money class="d-in" value={sumOf(list, "income")} tone="income" />
        <Money class="d-out" value={sumOf(list, "expense")} tone="expense" />
      </header>
    {/if}
    <ul>
      {#each list as t (t.id)}
        {@const cat = store.category(t.category)}
        {@const acc = store.account(t.account)}
        <li>
          <button type="button" class="d-row" onclick={() => onOpen(t)}>
            <span class="d-ico {tintOf(t)}"><Icon name={iconOf(t)} size={16} /></span>
            <span class="d-mid">
              <span class="d-desc">{titleOf(t)}</span>
              <span class="d-sub">
                {#if t.type === "transfer"}
                  {accountLine(t)}
                {:else}
                  {#if cat}<span class="d-cat" style:--tinte="var(--tinte-{tintOf(t).slice(5)})">{cat.name}</span
                    >{:else}Sin categoría{/if}{#if acc}{" · "}<span class="d-acc"
                      ><i style:background={colorOf(acc.palette)}></i>{acc.name}</span
                    >{/if}
                {/if}
              </span>
              {#if t._error}
                <span class="d-flag bad"><Icon name="alert-02" size={11} />No se pudo guardar</span>
              {:else if t._pending}
                <span class="d-flag"><Icon name="clock-01" size={11} />Por enviar</span>
              {:else if t.dup_of}
                <span class="d-flag warn"><Icon name="copy-01" size={11} />¿Repetido?</span>
              {:else if t.tags?.includes("revisar")}
                <span class="d-flag warn"><Icon name="alert-02" size={11} />Por revisar</span>
              {/if}
            </span>
            <Money class="d-amt" value={t.amount} tone={t.type === "transfer" ? undefined : t.type} />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="d-empty">{empty}</p>
{/each}

<style>
  /* Una tarjeta por día, con el aire del resumen alrededor. */
  .d-day.card {
    margin: 0 var(--sp-12) var(--sp-12);
    overflow: hidden;
  }

  .d-head {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-16) var(--sp-10);
    border-bottom: 1px solid var(--border);

    & :global(.d-in),
    & :global(.d-out) {
      font-size: var(--text-xs);
      text-align: right;
    }
  }

  .d-num {
    font-family: var(--font-num);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .d-dow {
    padding: 0.125rem var(--sp-8);
    border-radius: var(--radius-pill);
    background: var(--bg-field);
    box-shadow: var(--pillow);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-secondary);

    &.sun {
      background: var(--danger);
      box-shadow: none;
      color: #fff;
    }

    &.sat {
      background: var(--transfer);
      box-shadow: none;
      color: #fff;
    }
  }

  .d-month {
    font-family: var(--font-num);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  ul {
    margin: 0;
    padding: var(--sp-4) 0;
    list-style: none;
  }

  li + li .d-row::before {
    content: "";
    position: absolute;
    inset: 0 var(--sp-16) auto calc(var(--sp-16) + 2.25rem + var(--sp-12));
    border-top: 1px solid var(--border);
  }

  .d-row {
    position: relative;
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    min-height: 3.75rem;
    padding: var(--sp-10) var(--sp-16);
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s;

    &:active {
      background: var(--bg-hover);
    }

    & :global(.d-amt) {
      font-size: var(--text-sm);
      font-weight: 500;
    }
  }

  .d-ico {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
  }

  .d-mid {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    min-width: 0;
  }

  .d-desc,
  .d-sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .d-desc {
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .d-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  /* El nombre de la categoría en su color, legible en claro y en oscuro. */
  .d-cat {
    --tinta: color-mix(in oklab, var(--tinte) 72%, var(--text-primary));
    color: light-dark(oklch(from var(--tinta) min(l, 0.48) c h), oklch(from var(--tinta) max(l, 0.72) c h));
    font-weight: 500;
  }

  .d-acc i {
    display: inline-block;
    width: 0.4375rem;
    height: 0.4375rem;
    margin-right: 0.25rem;
    border-radius: 50%;
    vertical-align: 0.0625rem;
  }

  .d-flag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);

    &.warn {
      color: var(--warning, var(--accent));
    }

    &.bad {
      color: var(--danger);
    }
  }

  .d-empty {
    margin: var(--sp-8) var(--sp-12);
    padding: var(--sp-40) var(--sp-16);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--text-muted);
    text-align: center;
  }
</style>
