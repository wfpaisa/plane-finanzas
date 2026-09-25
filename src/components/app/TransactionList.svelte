<!--
  Transacciones agrupadas por día, con el total del día a la derecha.

  Con `compact`, una tabla: fecha (una celda por día), descripción,
  categoría, cuenta, correo y valor, una fila por movimiento.

  Con `selected`, el clic derecho marca o desmarca un movimiento para sumarlo
  (en el celular, dejarlo presionado). Mayús + clic derecho marca el tramo
  desde el último tocado, y el clic derecho en la fecha marca todo el día.
-->
<script lang="ts">
  import { dateLong } from "../../lib/format";
  import { colorOf, tintFor } from "../../lib/palettes";
  import { store } from "../../lib/store.svelte";
  import type { SvelteSet } from "svelte/reactivity";

  import type { Transaction } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import Tag, { type Tone } from "../ui/Tag.svelte";
  import Money from "./Money.svelte";

  let {
    items,
    onOpen,
    showAccount = true,
    compact = false,
    selected,
  }: {
    items: Transaction[];
    onOpen: (tx: Transaction) => void;
    showAccount?: boolean;
    compact?: boolean;
    /** Los ids marcados. Sin él, la lista no tiene casillas. */
    selected?: SvelteSet<string>;
  } = $props();

  let anchor: string | null = null;

  function toggle(t: Transaction, e: MouseEvent) {
    if (!selected) return;
    e.preventDefault();
    const on = !selected.has(t.id);
    if (e.shiftKey && anchor) {
      const ids = items.map((x) => x.id);
      const [a, b] = [ids.indexOf(anchor), ids.indexOf(t.id)].sort(
        (x, y) => x - y,
      );
      if (a >= 0)
        for (const id of ids.slice(a, b + 1))
          on ? selected.add(id) : selected.delete(id);
    } else if (on) selected.add(t.id);
    else selected.delete(t.id);
    anchor = t.id;
  }

  function toggleDay(list: Transaction[], e: MouseEvent) {
    if (!selected) return;
    e.preventDefault();
    const all = list.every((t) => selected.has(t.id));
    for (const t of list) all ? selected.delete(t.id) : selected.add(t.id);
  }

  const groups = $derived.by(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of items) {
      const d = t.date.slice(0, 10);
      map.set(d, [...(map.get(d) ?? []), t]);
    }
    return [...map.entries()].map(([day, list]) => ({
      day,
      list,
      net: list.reduce(
        (s, t) =>
          s +
          (t.type === "income"
            ? t.amount
            : t.type === "expense"
              ? -t.amount
              : 0),
        0,
      ),
    }));
  });

  // Cuántas filas abarca la celda de fecha de cada fila: la primera del día
  // las cubre todas; las demás (0) no dibujan la suya.
  const dateSpans = $derived.by(() => {
    const spans = items.map(() => 0);
    for (let i = 0; i < items.length; ) {
      let j = i + 1;
      while (
        j < items.length &&
        items[j].date.slice(0, 10) === items[i].date.slice(0, 10)
      )
        j++;
      spans[i] = j - i;
      i = j;
    }
    return spans;
  });

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const total = $derived(
    items.reduce(
      (s, t) =>
        s +
        (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0),
      0,
    ),
  );

  function iconOf(t: Transaction) {
    if (t.type === "transfer") return "arrow-data-transfer-horizontal";
    return (
      store.category(t.category)?.icon ||
      (t.type === "income" ? "money-receive-01" : "money-send-01")
    );
  }

  function tintOf(t: Transaction) {
    if (t.type === "transfer") return "tint-10";
    return store.category(t.category)?.color || "tint-10";
  }

  function titleOf(t: Transaction) {
    if (t.description) return t.description;
    if (t.type === "transfer") return "Transferencia";
    return (
      store.category(t.category)?.name ??
      (t.type === "income" ? "Ingreso" : "Gasto")
    );
  }
</script>

{#if compact}
  <div class="tx-table-wrap card">
    <table class="tx-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Descripción</th>
          <th>Categoría</th>
          {#if showAccount}<th>Cuenta</th>{/if}
          <th class="tx-mail-col" aria-label="Importado de Gmail"
            ><Icon name="mail-01" size={14} /></th
          >
          <th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {#each items as t, i (t.id)}
          {@const acc = store.account(t.account)}
          {@const to = store.account(t.to_account)}
          {@const cat = store.category(t.category)}
          <!-- La fila entera abre el movimiento; con teclado, el botón de la
               descripción (su clic sube hasta la fila). -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <tr
            class:tx-selected={selected?.has(t.id)}
            onclick={() => onOpen(t)}
            oncontextmenu={(e) => toggle(t, e)}
          >
            {#if dateSpans[i]}
              <!-- La fecha es del día entero: clic derecho marca o desmarca
                   todo el día, como el encabezado en la vista ampliada. -->
              <td
                class="tx-date"
                rowspan={dateSpans[i]}
                data-tip={capitalize(dateLong(t.date.slice(0, 10)))}
                onclick={(e) => e.stopPropagation()}
                oncontextmenu={(e) => {
                  e.stopPropagation();
                  toggleDay(items.slice(i, i + dateSpans[i]), e);
                }}>{t.date.slice(0, 10).replaceAll("-", "/")}</td
              >
            {/if}
            <!-- El filo izquierdo lleva el color de la categoría. -->
            <td class="tx-desc" style:--cat="var(--tinte-{tintOf(t).slice(5)})">
              <button
                type="button"
                aria-pressed={selected ? selected.has(t.id) : undefined}
                >{titleOf(t)}</button
              >
            </td>
            <td class="tx-cell"
              >{t.type === "transfer"
                ? "Transferencia"
                : (cat?.name ?? "Sin categoría")}</td
            >
            {#if showAccount}
              <td class="tx-cell">
                {#if t.type === "transfer"}
                  <span class="tx-acc"
                    ><i style:background={colorOf(acc?.palette)}
                    ></i>{acc?.name ?? "?"}</span
                  >
                  →
                  <span class="tx-acc"
                    ><i style:background={colorOf(to?.palette)}></i>{to?.name ??
                      "?"}</span
                  >
                {:else if acc}
                  <span class="tx-acc"
                    ><i style:background={colorOf(acc.palette)}
                    ></i>{acc.name}</span
                  >
                {/if}
              </td>
            {/if}
            <td class="tx-mail-col">
              {#if t.source === "gmail"}<span data-tip="Importado de Gmail"
                  ><Icon name="mail-01" size={14} /></span
                >{/if}
            </td>
            <td class="num"><Money value={t.amount} tone={t.type} /></td>
          </tr>
        {/each}
      </tbody>
      <!-- El neto de lo que está a la vista; las transferencias no lo mueven. -->
      <tfoot>
        <tr>
          <td>Total</td>
          <td colspan={showAccount ? 4 : 3}
            >{items.length}
            {items.length === 1 ? "movimiento" : "movimientos"}</td
          >
          <td class="num"><Money value={total} tone="auto" /></td>
        </tr>
      </tfoot>
    </table>
  </div>
{:else}
  <div class="tx-groups">
    {#each groups as g (g.day)}
      <section class="tx-day">
        <!-- Atajo del mouse: con teclado se marca fila por fila (tecla de menú
           o Mayús+F10 sobre la fila, que también disparan contextmenu). -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <header class="tx-day-head" oncontextmenu={(e) => toggleDay(g.list, e)}>
          <span class="tx-day-label">{dateLong(g.day)}</span>
          <Money value={g.net} tone="auto" />
        </header>
        <ul class="tx-rows" class:no-acc={!showAccount}>
          {#each g.list as t (t.id)}
            {@const acc = store.account(t.account)}
            {@const to = store.account(t.to_account)}
            {@const cat = store.category(t.category)}
            <li class:tx-selected={selected?.has(t.id)}>
              <button
                type="button"
                class="tx-row"
                aria-pressed={selected ? selected.has(t.id) : undefined}
                onclick={() => onOpen(t)}
                oncontextmenu={(e) => toggle(t, e)}
              >
                <span class="tx-ico {tintOf(t)}"
                  ><Icon name={iconOf(t)} size={16} /></span
                >
                <span class="tx-main">
                  <span class="tx-title">{titleOf(t)}</span>
                  <!-- Angosto: todo en una línea debajo del título. -->
                  <span class="tx-sub">
                    {#if t.type === "transfer"}
                      {acc?.name ?? "?"} → {to?.name ?? "?"}
                    {:else}
                      {cat?.name ??
                        "Sin categoría"}{#if showAccount && acc}{" · "}<span
                          class="tx-acc"
                          ><i style:background={colorOf(acc.palette)}
                          ></i>{acc.name}</span
                        >{/if}
                    {/if}
                    {#if t.attachments?.length}<Icon
                        name="attachment-01"
                      />{/if}
                    {#if t.source === "gmail"}<Icon name="mail-01" />{/if}
                  </span>
                  <!-- Ancho: la nota va debajo del título; lo demás, en columnas. -->
                  {#if t.notes}<span class="tx-notes">{t.notes}</span>{/if}
                  {#if t.tags?.length}
                    <span class="tx-tags">
                      {#each t.tags as tag (tag)}
                        <Tag
                          tone={(tag === "revisar"
                            ? "tag-warning"
                            : tintFor(tag)) as Tone}>#{tag}</Tag
                        >
                      {/each}
                    </span>
                  {/if}
                </span>
                <span class="tx-col tx-col-cat">
                  {#if t.type === "transfer"}Transferencia{:else}{cat?.name ??
                      "Sin categoría"}{/if}
                </span>
                {#if showAccount}
                  <span class="tx-col tx-col-acc">
                    {#if t.type === "transfer"}
                      <span class="tx-acc"
                        ><i style:background={colorOf(acc?.palette)}
                        ></i>{acc?.name ?? "?"}</span
                      >
                      <Icon name="arrow-right-02" size={12} />
                      <span class="tx-acc"
                        ><i style:background={colorOf(to?.palette)}
                        ></i>{to?.name ?? "?"}</span
                      >
                    {:else if acc}
                      <span class="tx-acc"
                        ><i style:background={colorOf(acc.palette)}
                        ></i>{acc.name}</span
                      >
                    {/if}
                  </span>
                {/if}
                <span class="tx-col tx-col-marks">
                  {#if t.attachments?.length}<Icon
                      name="attachment-01"
                      size={14}
                    />{/if}
                  {#if t.source === "gmail"}<span data-tip="Importado de Gmail"
                      ><Icon name="mail-01" size={14} /></span
                    >{/if}
                </span>
                <Money value={t.amount} tone={t.type} />
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<style>
  /* Compacto: en angosto la tabla se desliza de lado dentro de su tarjeta. */
  .tx-table-wrap {
    padding: 0;
    overflow-x: auto;
  }

  .tx-table {
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
      padding: var(--sp-6) var(--sp-12);
      white-space: nowrap;
    }

    & tbody tr {
      cursor: pointer;

      /* Filas intercaladas: se sigue la línea de un lado al otro. */
      &:nth-child(even) {
        background: color-mix(in oklab, var(--text-primary) 0.3%, transparent);
      }

      &:hover {
        background: var(--bg-hover);
      }

      & + tr td {
        border-top: var(--border-width) solid var(--border);
      }

      &.tx-selected {
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

  .tx-date {
    vertical-align: middle;
    background: var(--bg-card);
    cursor: default;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Toma el ancho sobrante y recorta con puntos suspensivos; en angosto no
     baja de 12rem y la tabla se desliza. */
  .tx-desc {
    width: 100%;
    min-width: 12rem;
    max-width: 0;
    box-shadow: inset 4px 0 0 var(--cat, transparent);

    & button {
      display: block;
      width: 100%;
      overflow: hidden;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-primary);
      font: inherit;
      font-weight: 500;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
  }

  .tx-mail-col {
    width: 1%;
    color: var(--text-muted);
    text-align: center;

    & span {
      display: inline-flex;
    }
  }

  .tx-cell {
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .tx-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
    container-type: inline-size;
  }

  .tx-day-head {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: 0 var(--sp-4) var(--sp-6);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-muted);

    & .tx-day-label {
      display: inline-block;
      flex: 1;
    }

    & .tx-day-label::first-letter {
      text-transform: uppercase;
    }
  }

  .tx-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-card);
    overflow: hidden;

    & li {
      display: flex;
      align-items: center;

      &:hover {
        background: var(--bg-hover);
      }
    }

    & li + li {
      border-top: var(--border-width) solid var(--border);
    }

    /* Marcado para sumar: un lavado del acento y su filo a la izquierda. */
    & li.tx-selected {
      background: color-mix(in oklab, var(--accent) 12%, transparent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
  }

  .tx-row {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: var(--sp-12);
    padding: var(--sp-10) var(--sp-12);
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    & > :global(.money) {
      font-weight: 600;
      font-size: var(--text-sm);
    }
  }

  .tx-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
  }

  .tx-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  .tx-title {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .tx-sub {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .tx-acc {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;

    & i {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--chart-1);
    }
  }

  .tx-notes,
  .tx-col {
    display: none;
  }

  /* Con espacio, cada dato en su columna: se lee de un vistazo y el monto
     no queda solo al otro extremo. Las columnas se alinean entre filas porque
     todas usan la misma plantilla. */
  @container (min-width: 44rem) {
    .tx-row {
      display: grid;
      grid-template-columns:
        2.25rem minmax(0, 2.2fr) minmax(0, 1fr) minmax(0, 1.1fr)
        2.5rem minmax(7rem, auto);
      column-gap: var(--sp-16);

      & > :global(.money) {
        text-align: right;
      }
    }

    .tx-sub {
      display: none;
    }

    .tx-notes {
      display: block;
      overflow: hidden;
      font-size: var(--text-xs);
      color: var(--text-muted);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .tx-col {
      display: flex;
      align-items: center;
      gap: var(--sp-4);
      min-width: 0;
      overflow: hidden;
      font-size: var(--text-xs);
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .tx-col-marks {
      justify-content: flex-end;
      color: var(--text-muted);
    }

    .tx-acc {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;

      & i {
        flex: none;
      }
    }
  }

  /* Sin la columna de cuenta (filtrado por una cuenta), la plantilla la omite. */
  @container (min-width: 44rem) {
    .tx-rows.no-acc .tx-row {
      grid-template-columns: 2.25rem minmax(0, 2.6fr) minmax(0, 1.2fr) 2.5rem minmax(
          7rem,
          auto
        );
    }
  }

  .tx-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
    margin-top: 0.125rem;

    & :global(.tag) {
      font-size: 0.6875rem;
      padding-block: 0;
    }
  }
</style>
