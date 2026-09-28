<!--
  Lo que toca pagar (y recibir) en un mes: los fijos que caen en él, con lo
  ya pagado y lo que falta. Tocar uno pendiente abre su movimiento ya
  llenado; al guardarlo queda pagado. El círculo lo marca de una vez, con
  los datos del fijo. Uno pagado abre su movimiento para verlo o editarlo.

  El movimiento queda unido al fijo por su marca (`recurringKey`), la misma
  que usa el programador para los automáticos: así no se repiten. Lo marcado
  en el mes sale siempre, aunque su fijo ya no toque (pausado, terminado,
  cambiado o borrado).
-->
<script lang="ts">
  import { dueDate, lastDayOf, monthRange, recurringKey, today } from "../../lib/finance";
  import { dateShort, monthLabel } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { cachedList, offline } from "../../lib/offline.svelte";
  import { overlay, type Pending } from "../../lib/outbox";
  import { pb, session } from "../../lib/pb.svelte";
  import { store } from "../../lib/store.svelte";
  import { recurringTags } from "../../lib/tags";
  import type { Recurring, Transaction, TxDraft } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import MonthNav from "../mobile/MonthNav.svelte";
  import CategoryPill from "./CategoryPill.svelte";
  import Money from "./Money.svelte";
  import TransactionForm from "./TransactionForm.svelte";

  let { onEdit }: { onEdit?: (r: Recurring) => void } = $props();

  const now = today();
  let ym = $state(now.slice(0, 7));

  interface Due {
    r: Recurring;
    /** El día que toca; `null` si no tiene día fijo. */
    date: string | null;
    key: string;
    /** Marcado cuando su fijo ya se borró: `r` sale del movimiento. */
    orphan?: boolean;
  }

  const due = $derived(
    store.recurring
      .filter((r) => !r.paused)
      .flatMap((r): Due[] => {
        const d = dueDate(r, ym);
        return d ? [{ r, date: d.length === 10 ? d : null, key: recurringKey(r, ym) }] : [];
      })
      // Por día; los que no tienen día, al final.
      .toSorted((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || a.r.name.localeCompare(b.r.name)),
  );
  const keys = $derived(due.map((d) => d.key));

  /** De qué mes es un movimiento marcado: el de su marca, si es mensual; si no, el de su fecha. */
  function keyMonth(t: Pick<Transaction, "external_id" | "date">) {
    const s = t.external_id.split(":")[2] ?? "";
    return s.length === 7 ? s : t.date.slice(0, 7);
  }

  let serverTxs = $state<Transaction[]>([]);
  let loading = $state(true);

  $effect(() => {
    void store.txVersion;
    const list = keys;
    const [from, to] = monthRange(ym);
    let alive = true;
    // Los que tocan este mes, más todo lo marcado de este mes: por la marca
    // (los mensuales) o por la fecha (los anuales y los de una vez).
    const params: Record<string, string> = { pat: `rec:%:${ym}`, from, to };
    list.forEach((k, i) => (params[`k${i}`] = k));
    const filter = pb.filter(
      [
        "external_id ~ {:pat}",
        "(external_id ~ 'rec:%' && date >= {:from} && date < {:to})",
        ...list.map((_, i) => `external_id = {:k${i}}`),
      ].join(" || "),
      params,
    );
    loading = true;
    cachedList(
      `rec:${ym}`,
      () => pb.collection("transactions").getFullList<Transaction>({ filter, sort: "-date", batch: 500 }),
      (r) => alive && (serverTxs = r),
    )
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  // Encima, lo que falta por enviar: lo marcado sin conexión ya cuenta.
  const paid = $derived.by(() => {
    const set = new Set(keys);
    const map = new Map<string, Pending<Transaction>>();
    const mine = (t: Transaction) =>
      set.has(t.external_id) || (t.external_id?.startsWith("rec:") && keyMonth(t) === ym);
    for (const t of overlay("transactions", serverTxs, offline.items, mine)) map.set(t.external_id, t);
    return map;
  });

  /** Lo marcado cuyo fijo ya no toca este mes, con su fijo si aún existe. */
  const extra = $derived.by(() => {
    const set = new Set(keys);
    return [...paid.values()]
      .filter((t) => !set.has(t.external_id))
      .map((t): Due => {
        const r = store.recurring.find((x) => x.id === t.external_id.split(":")[1]);
        const fake = { id: "", name: t.description || "Recurrente borrado", kind: t.type, amount: t.amount, category: t.category } as Recurring;
        return { r: r ?? fake, date: t.date.slice(0, 10), key: t.external_id, orphan: !r };
      });
  });

  const rows = $derived(
    [...due, ...extra].toSorted((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || a.r.name.localeCompare(b.r.name)),
  );

  // Los gastos (con las transferencias, que también son pagos) y los ingresos, cada uno en su lista.
  const groups = $derived(
    [
      { id: "out", title: "Gastos y pagos", items: rows.filter((d) => d.r.kind !== "income"), left: "por pagar" },
      { id: "in", title: "Ingresos", items: rows.filter((d) => d.r.kind === "income"), left: "por recibir" },
    ].filter((g) => g.items.length),
  );

  const done = $derived(rows.filter((d) => paid.has(d.key)).length);

  /** Sin día fijo, la fecha es hoy si cae en el mes; si no, su primer o último día. */
  function dateFor(d: Due) {
    if (d.date) return d.date;
    if (now.slice(0, 7) === ym) return now;
    return ym < now ? `${ym}-${String(lastDayOf(ym)).padStart(2, "0")}` : `${ym}-01`;
  }

  function draftOf(d: Due): TxDraft {
    const r = d.r;
    return {
      type: r.kind,
      amount: r.amount,
      date: dateFor(d),
      account: r.account,
      to_account: r.kind === "transfer" ? r.to_account : "",
      category: r.kind === "transfer" ? "" : r.category,
      description: r.name,
      notes: "",
      tags: recurringTags(r.tags),
      rule: "",
    };
  }

  // El formulario: un movimiento pagado (para editarlo) o uno por pagar.
  let formOpen = $state(false);
  let editTx = $state<Transaction | null>(null);
  let draft = $state<TxDraft | null>(null);
  let link = $state<{ external_id: string } | null>(null);

  function open(d: Due) {
    const tx = paid.get(d.key);
    editTx = tx ?? null;
    draft = tx ? null : draftOf(d);
    link = tx ? null : { external_id: d.key };
    formOpen = true;
  }

  let marking = $state("");

  /** Marcarlo de una vez con lo del fijo. Sin cuenta (o sin destino), abre el formulario. */
  async function mark(d: Due) {
    const t = draftOf(d);
    if (!t.account || (t.type === "transfer" && !t.to_account)) return open(d);
    marking = d.key;
    try {
      await offline.create("transactions", {
        owner: session.id,
        type: t.type,
        amount: t.amount,
        date: `${t.date} 12:00:00.000Z`,
        account: t.account,
        to_account: t.to_account,
        category: t.category,
        description: t.description,
        notes: "",
        tags: t.tags,
        source: "recurrente",
        external_id: d.key,
      });
      notify.done(d.r.kind === "income" ? "Marcado como recibido" : "Marcado como pagado");
    } catch (err) {
      notify.fail(err);
    } finally {
      marking = "";
    }
  }

  const doneWord = (d: Due) => (d.r.kind === "income" ? "Recibido" : "Pagado");

  function status(d: Due): { text: string; tone?: "late" | "today" } {
    const income = d.r.kind === "income";
    if (!d.date) return { text: "Este mes, sin día fijo" };
    if (d.r.auto_create && d.date >= now) return { text: `${income ? "Se registra" : "Se paga"} solo el ${dateShort(d.date)}` };
    if (d.date < now) return income ? { text: `Debió llegar el ${dateShort(d.date)}` } : { text: `Venció el ${dateShort(d.date)}`, tone: "late" };
    if (d.date === now) return { text: "Hoy", tone: "today" };
    return { text: `${income ? "Llega" : "Vence"} el ${dateShort(d.date)}` };
  }
</script>

<div class="card rm">
  <div class="card-head rm-head">
    <div>
      <h3 class="card-title">Pagos del mes</h3>
      <p class="card-sub">
        {#if rows.length}
          {done} de {rows.length} al día
        {:else}
          Nada programado para {monthLabel(ym, true)}
        {/if}
      </p>
    </div>
    <MonthNav bind:ym />
  </div>

  {#if rows.length}
    <div class="rm-bar" aria-hidden="true"><span style:width="{(done / rows.length) * 100}%"></span></div>
  {/if}

  {#each groups as g (g.id)}
    {@const gDone = g.items.filter((d) => paid.has(d.key)).length}
    {@const gLeft = g.items.filter((d) => !paid.has(d.key)).reduce((a, d) => a + d.r.amount, 0)}
    <section class="rm-group" class:loading>
      <h4 class="rm-group-head">
        <span>{g.title}</span>
        <span class="rm-group-sum">{gDone} de {g.items.length}{#if gLeft} · <Money value={gLeft} /> {g.left}{/if}</span>
      </h4>
      <ul class="rm-list">
        {#each g.items as d (d.key)}
          {@render item(d)}
        {/each}
      </ul>
    </section>
  {:else}
    {#if !store.recurring.length}
      <p class="rm-empty">Agrega tus gastos, ingresos o transferencias recurrentes y aquí verás cuándo toca cada uno.</p>
    {/if}
  {/each}
</div>

{#snippet item(d: Due)}
  {@const tx = paid.get(d.key)}
  {@const st = status(d)}
  <li class="rm-row" class:done={!!tx}>
    {#if tx}
      <button type="button" class="rm-check on" aria-label="Ver el movimiento" data-tip="Ver el movimiento" onclick={() => open(d)}>
        <Icon name="checkmark-circle-02" size={22} />
      </button>
    {:else}
      <button
        type="button"
        class="rm-check"
        aria-label={d.r.kind === "income" ? "Marcar como recibido" : "Marcar como pagado"}
        data-tip={d.r.kind === "income" ? "Marcar como recibido" : "Marcar como pagado"}
        disabled={marking === d.key}
        onclick={() => mark(d)}
      >
        <Icon name="circle" size={22} />
      </button>
    {/if}
    <button type="button" class="rm-main" onclick={() => open(d)}>
      <span class="rm-text">
        <span class="rm-name">{d.r.name}</span>
        <span class="rm-sub">
          {#if tx}
            {doneWord(d)} el {dateShort(tx.date)}{#if tx._pending} · sin enviar{/if}
          {:else}
            <span class={st.tone ? `rm-${st.tone}` : ""}>{st.text}</span>{#if d.r.auto_create}<Icon name="repeat" />{/if}
          {/if}
        </span>
      </span>
      {#if d.r.kind !== "transfer" && (tx?.category ?? d.r.category)}<span class="rm-cat"><CategoryPill id={tx?.category ?? d.r.category} /></span>{/if}
      <span class="rm-amount"><Money value={tx?.amount ?? d.r.amount} tone={d.r.kind} /></span>
    </button>
    {#if onEdit && !d.orphan}
      <button type="button" class="btn-icon sm rm-edit" aria-label="Editar el recurrente" data-tip="Editar el recurrente" onclick={() => onEdit(d.r)}>
        <Icon name="edit-02" />
      </button>
    {/if}
  </li>
{/snippet}

<TransactionForm
  open={formOpen}
  tx={editTx}
  {draft}
  {link}
  title={link ? (draft?.type === "income" ? "Marcar como recibido" : "Marcar como pagado") : undefined}
  onClose={() => (formOpen = false)}
/>

<style>
  .rm-head {
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--sp-8);
  }

  .rm-bar {
    height: 4px;
    margin: var(--sp-4) var(--sp-16) var(--sp-8);
    border-radius: 999px;
    background: var(--bg-field);
    overflow: hidden;

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--success);
      transition: width 0.3s ease;
    }
  }

  .rm-group {
    padding: 0 var(--sp-8) var(--sp-8);
    transition: opacity 0.2s;

    &.loading {
      opacity: 0.7;
    }

    & + .rm-group {
      padding-top: var(--sp-8);
      border-top: var(--border-width) solid var(--border);
    }
  }

  .rm-group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-4) var(--sp-12);
    margin: 0;
    padding: var(--sp-6) var(--sp-8);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .rm-group-sum {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--text-muted);
  }

  .rm-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rm-row {
    display: flex;
    align-items: center;
    gap: var(--sp-4);

    & + .rm-row {
      border-top: var(--border-width) solid var(--border);
    }

    &.done .rm-name {
      color: var(--text-secondary);
    }
  }

  .rm-check {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      color: var(--success);
    }

    &.on {
      color: var(--success);
    }

    &:disabled {
      opacity: 0.5;
      cursor: progress;
    }
  }

  .rm-main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-10);
    min-width: 0;
    padding: var(--sp-8) var(--sp-4);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }
  }

  .rm-text {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .rm-name {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rm-sub {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .rm-late {
    color: var(--danger);
  }

  .rm-today {
    color: var(--warning);
    font-weight: 600;
  }

  .rm-amount {
    font-weight: 600;
  }

  .rm-edit {
    flex: none;
    color: var(--text-muted);
  }

  .rm-empty {
    margin: 0;
    padding: 0 var(--sp-16) var(--sp-16);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  /* En el teléfono la categoría no cabe junto al nombre y el monto. */
  @media (max-width: 30rem) {
    .rm-cat {
      display: none;
    }
  }
</style>
