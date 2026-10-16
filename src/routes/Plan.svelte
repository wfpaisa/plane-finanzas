<!--
  Gastos e ingresos: el mes que se ve (su selector va junto al título), los
  programados del mes para marcar, el resumen del mes o del año y la lista de cada programado.
-->
<script lang="ts">
  import CategoryPill from "../components/app/CategoryPill.svelte";
  import Money from "../components/app/Money.svelte";
  import MonthNav from "../components/mobile/MonthNav.svelte";
  import RecurringForm from "../components/app/RecurringForm.svelte";
  import RecurringMonth from "../components/app/RecurringMonth.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import Icon from "../components/Icon.svelte";
  import { band, flowLayout } from "../lib/analysis";
  import { useCardPlan } from "../lib/cardPlan.svelte";
  import { isCard } from "../lib/cards";
  import { activeIn, addMonths, monthlyEquivalent, today, type TxType } from "../lib/finance";
  import { monthLabel, monthName } from "../lib/format";
  import { keys } from "../lib/keys";
  import { notify } from "../lib/notify.svelte";
  import { cachedList } from "../lib/offline.svelte";
  import { pb } from "../lib/pb.svelte";
  import { store } from "../lib/store.svelte";
  import type { Recurring, Transaction } from "../lib/types";

  const thisYm = today().slice(0, 7);
  // Todo sigue al mes que se ve en la lista del mes.
  let ym = $state(thisYm);

  let formOpen = $state(false);
  let editing = $state<Recurring | null>(null);
  let newKind = $state<TxType>("expense");

  const cards = useCardPlan(() => ym);

  // Por mes, o el año de ese mes: lo registrado de enero a hoy.
  let span = $state<"month" | "year">("month");
  const yearly = $derived(span === "year");
  const year = $derived(ym.slice(0, 4));
  const toDate = $derived(year === thisYm.slice(0, 4) && thisYm.slice(5) !== "12");

  type Row = Pick<Transaction, "type" | "amount" | "account" | "external_id" | "recurring_key">;
  let yearTxs = $state<Row[]>([]);
  $effect(() => {
    if (!yearly) return;
    void store.txVersion;
    const y = year;
    let alive = true;
    const filter = pb.filter('date >= {:from} && date < {:to}', { from: `${y}-01-01`, to: `${Number(y) + 1}-01-01` });
    cachedList<Row>(
      `year:${y}`,
      () => pb.collection("transactions").getFullList<Row>({ filter, fields: "type,amount,account,external_id,recurring_key", batch: 1000 }),
      (rows) => alive && (yearTxs = rows),
    ).catch(notify.fail);
    return () => (alive = false);
  });

  /** Lo registrado en el año: ingresos y gastos (programados, con tarjeta y otros) y lo puesto en los ahorros. */
  const recorded = $derived.by(() => {
    const programmed = (t: Row) => !!t.recurring_key || (t.external_id ?? "").startsWith("rec:");
    const cardIds = new Set(store.accounts.filter(isCard).map((a) => a.id));
    // De las transferencias solo cuentan las que reservan dinero para un pago.
    const forPayment = new Set(store.recurring.filter((r) => r.kind === "transfer" && r.for_payment).map((r) => r.id));
    const sum = { income: 0, incomeOther: 0, fixed: 0, card: 0, other: 0, savings: 0 };
    for (const t of yearTxs) {
      if (t.type === "transfer") {
        if (forPayment.has((t.recurring_key || t.external_id || "").split(":")[1])) sum.fixed += t.amount;
      } else if (t.type === "income") {
        sum.income += t.amount;
        if (!programmed(t)) sum.incomeOther += t.amount;
      } else if (programmed(t)) sum.fixed += t.amount;
      else if (cardIds.has(t.account)) sum.card += t.amount;
      else sum.other += t.amount;
    }
    const goals = new Set(store.savings.map((s) => s.id));
    const own = new Set(store.accounts.map((a) => a.id));
    sum.savings = Math.max(
      0,
      store.movements
        .filter((m) => goals.has(m.saving) && m.date.startsWith(year) && (!m.account || own.has(m.account)))
        .reduce((a, m) => a + m.amount, 0),
    );
    return sum;
  });

  const plan = $derived(store.planFor(ym));
  const income = $derived(yearly ? recorded.income : plan.income);
  /** Lo que queda: en el mes, después de reservar todo; en el año, lo que sobró de lo registrado. */
  const free = $derived(
    yearly ? recorded.income - recorded.fixed - recorded.card - recorded.other - recorded.savings : plan.free - cards.current.total,
  );
  const period = $derived(
    !yearly ? monthLabel(ym) : !toDate ? year : thisYm.endsWith("-01") ? monthLabel(thisYm) : `ene – ${monthLabel(thisYm)}`,
  );
  const title = $derived(
    !yearly
      ? `Resumen de ${monthLabel(ym, true)}`
      : toDate
        ? `Consolidado de ${year}, de enero a ${monthLabel(thisYm, true).split(" ")[0]}`
        : `Consolidado de ${year}`,
  );

  const incomes = $derived(store.recurring.filter((r) => r.kind === "income"));
  // Las transferencias van con los gastos: también son pagos. Solo suman en el plan las que reservan dinero para un pago.
  const expenses = $derived(store.recurring.filter((r) => r.kind !== "income"));

  const share = (n: number) => (income > 0 ? Math.max(0, (n / income) * 100) : 0);
  // El flujo del ingreso: a la derecha, a dónde va cada peso. Si lo
  // planeado se pasa del ingreso, la última banda es lo que falta, y la
  // barra del ingreso cubre solo la parte que alcanza a pagar.
  const FLOW_W = 1000;
  const NODE = 12;
  const parts = $derived(
    [
      { id: "fixed", label: "Pagos programados", value: yearly ? recorded.fixed : plan.fixed, tint: "seg-fixed" },
      { id: "card", label: yearly ? "Gastos con tarjeta" : "Tarjetas de crédito", value: yearly ? recorded.card : cards.current.total, tint: "seg-card" },
      { id: "other", label: "Otros gastos", value: yearly ? recorded.other : 0, tint: "seg-other" },
      { id: "save", label: "Ahorros", value: yearly ? recorded.savings : plan.savings, tint: "seg-save" },
      free < 0
        ? { id: "short", label: yearly ? "Gastaste de más" : "Te falta este mes", value: -free, tint: "seg-short" }
        : { id: "free", label: yearly ? "Te quedó" : "Disponible para gastar", value: free, tint: "seg-free" },
    ].filter((p) => p.value > 0),
  );
  // Más alto con más partes, para que cada etiqueta quepa junto a su nodo.
  const FLOW_H = $derived(Math.max(240, parts.length * 66));
  const flow = $derived(flowLayout([], parts, FLOW_H, 8, 46));
  const inH = $derived(flow.total ? (FLOW_H * Math.min(income, flow.total)) / flow.total : 0);
  /** La barra del ingreso, partida: arriba los programados, abajo los demás registrados. */
  const inOtherH = $derived(yearly && income ? (inH * recorded.incomeOther) / income : 0);

  function edit(r: Recurring | null, kind: TxType = "expense") {
    editing = r;
    newKind = kind;
    formOpen = true;
  }

  const freqLabel = (r: Recurring) =>
    r.frequency === "yearly"
      ? `Anual · ${monthName(r.month || 1)}`
      : r.frequency === "once"
        ? `Una vez · ${r.start_date?.slice(0, 10) ?? ""}`
        : r.day_of_month
          ? `Día ${r.day_of_month}`
          : "Sin día fijo";

  /** Por qué un fijo no suma en el plan de este mes: ya terminó o aún no empieza. */
  const outOfPlan = (r: Recurring) => {
    if (r.paused || r.frequency === "once" || activeIn(r, thisYm)) return "";
    const end = r.end_date?.slice(0, 7);
    return end && end < thisYm ? `terminó en ${monthLabel(end)}` : `empieza en ${monthLabel(r.start_date.slice(0, 7))}`;
  };
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Gastos e ingresos</h1>
      <p>Marca los pagos e ingresos programados de cada mes cuando los hagas o los recibas.</p>
    </div>
    <div class="page-actions"><MonthNav bind:ym /></div>
  </header>

  <div class="stack">
    <RecurringMonth bind:ym />

    <!-- El ingreso a la izquierda se abre en bandas hacia lo que se lleva
         cada parte, cada una del grueso de su monto. Lo que queda para
         gastar es la respuesta, y va más grande. -->
    <div class="card plan-card">
      <div class="plan-head">
        <h3 class="card-title">{title}</h3>
        <Segmented
          bind:value={span}
          label="Ver el resumen"
          options={[
            { id: "month", label: "Mes" },
            { id: "year", label: "Año" },
          ]}
        />
      </div>
      {#if income > 0}
        <div class="pflow" style:height="{FLOW_H}px">
          <div class="pflow-labels left">
            <div class="pflow-label" style:top="{(Math.min(inH, FLOW_H) / 2 / FLOW_H) * 100}%">
              <span class="pflow-name">{yearly ? `Ingresos de ${period}` : `Ingresos programados de ${period}`}</span>
              <span class="pflow-amount"><Money value={income} /></span>
              {#if yearly && recorded.incomeOther > 0}
                <span class="pflow-split"><i class="pflow-dot"></i>Programados <Money value={income - recorded.incomeOther} /></span>
                <span class="pflow-split"><i class="pflow-dot once"></i>Otros <Money value={recorded.incomeOther} /></span>
              {/if}
            </div>
          </div>
          <svg viewBox="0 0 {FLOW_W} {FLOW_H}" preserveAspectRatio="none" aria-hidden="true">
            {#each flow.right as n (n.id)}
              <path class="pflow-band {n.tint}" d={band(NODE, n.my, n.mh, FLOW_W - NODE, n.y, n.h)} />
              <rect class="pflow-node {n.tint}" x={FLOW_W - NODE} y={n.y} width={NODE} height={n.h} rx="3" />
            {/each}
            <rect class="pflow-income" x="0" y="0" width={NODE} height={inH} rx="3" />
            {#if inOtherH}<rect class="pflow-income once" x="0" y={inH - inOtherH} width={NODE} height={inOtherH} rx="3" />{/if}
          </svg>
          <div class="pflow-labels right">
            {#each flow.right as n (n.id)}
              {@const main = n.id === "free" || n.id === "short"}
              <div class="pflow-label {n.tint}" class:main style:top="{((n.y + n.h / 2) / FLOW_H) * 100}%">
                <span class="pflow-name">{n.label}{#if free >= 0} · {Math.round(share(n.value))}%{/if}</span>
                <span class="pflow-amount"><Money value={n.value} /></span>
                {#if n.id === "short"}<span class="pflow-sub"
                    >{yearly ? "Tus gastos y ahorros superan tus ingresos del año." : "Tus pagos, ahorros y tarjetas superan tus ingresos."}</span
                  >{/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="muted small">
          {yearly
            ? `No hay ingresos registrados en ${period}. Registra uno para comparar ingresos y gastos.`
            : `No hay ingresos programados en ${monthLabel(ym, true)}. Programa un ingreso para calcular cuánto puedes destinar a pagos, ahorros y otros gastos.`}
        </p>
      {/if}
    </div>

    <!-- De aquí en adelante, lo que se repite: los programados que forman el plan. -->
    <header class="section-head plan-section">
      <div>
        <h2 class="card-title-icon"><Icon name="repeat" />Programación de ingresos y pagos</h2>
        <p>Los ingresos y pagos que se repiten. Con ellos se calcula el plan de cada mes.</p>
      </div>
    </header>

    <div class="split-even">
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Ingresos programados</h3>
            <p class="card-sub">Total de este mes: <Money value={store.plan.income} /></p>
          </div>
          <div class="card-head-actions">
            <button type="button" class="btn sm" onclick={() => edit(null, "income")}><Icon name="add-01" />Programar ingreso</button>
          </div>
        </div>
        <div class="card-body">
          {#each incomes as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">No hay ingresos programados. Programa tu sueldo u otro ingreso habitual.</div>
          {/each}
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Pagos programados</h3>
            <p class="card-sub">Total mensual estimado: <Money value={store.plan.fixed} /></p>
          </div>
          <div class="card-head-actions">
            <button type="button" class="btn sm" onclick={() => edit(null, "expense")}><Icon name="add-01" />Programar pago</button>
          </div>
        </div>
        <div class="card-body">
          {#each expenses as r (r.id)}
            {@render row(r)}
          {:else}
            <div class="empty-card">No hay pagos programados. Programa servicios, cuotas u otros pagos habituales.</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

{#snippet row(r: Recurring)}
  {@const out = outOfPlan(r)}
  <button type="button" class="fixed-row" class:paused={r.paused || !!out} onclick={() => edit(r)}>
    <span class="fixed-main">
      <span class="fixed-name">{r.name}</span>
      <span class="fixed-sub">
        {#if r.kind === "transfer"}{r.for_payment ? "Reservada para un pago" : "Transferencia"} · {/if}{freqLabel(r)}{#if r.auto_create} · <Icon name="repeat" /> registro automático{/if}{#if r.saving} · reserva mensual{/if}{#if r.paused} · en pausa{/if}{#if out} · {out}{/if}
      </span>
    </span>
    {#if r.category}<CategoryPill id={r.category} />{/if}
    <span class="fixed-amount">
      <Money value={r.amount} tone={r.kind} />
      {#if r.frequency === "yearly"}<span class="small muted"><Money value={monthlyEquivalent(r)} />/mes</span>{/if}
    </span>
  </button>
{/snippet}

<!-- Las flechas del teclado pasan de mes (ver `lib/keys.ts`). -->
<svelte:window
  onkeydown={keys({
    ArrowLeft: () => (ym = addMonths(ym, -1)),
    ArrowRight: () => (ym = addMonths(ym, 1)),
  })}
/>

<RecurringForm open={formOpen} item={editing} kind={newKind} onClose={() => (formOpen = false)} />

<style>
  .plan-section {
    margin: var(--sp-16) 0 0;

    & p {
      margin: var(--sp-4) 0 0;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }

    & h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  }

  .plan-card {
    padding: var(--sp-20);
  }

  .plan-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    margin-bottom: var(--sp-16);
  }

  .card-title-icon {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
  }

  /* Las bandas son un SVG que se estira a lo ancho; las etiquetas, HTML
     encima, para que la letra no se deforme. Como en MoneyFlow. */
  .pflow {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 3fr) minmax(0, 1.4fr);
    gap: var(--sp-12);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.8fr) minmax(0, 1.3fr);
      gap: var(--sp-6);
    }

    & svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .pflow-labels {
    position: relative;

    &.left .pflow-label {
      right: 0;
      align-items: flex-end;
      text-align: right;
    }

    &.right .pflow-label {
      left: 0;
    }
  }

  .pflow-label {
    --ink: light-dark(oklch(from var(--seg) calc(l - 0.14) c h), var(--seg));

    position: absolute;
    display: flex;
    flex-direction: column;
    max-width: 100%;
    transform: translateY(-50%);

    &.main .pflow-amount {
      font-size: 1.625rem;
      line-height: 1.15;
    }
  }

  .pflow-name {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .pflow-amount {
    font-family: var(--font-num);
    font-size: 1.125rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .pflow-labels.right :is(.pflow-name, .pflow-amount :global(.money)),
  .pflow-sub {
    color: var(--ink);
  }

  .pflow-sub {
    font-size: var(--text-xs);
  }

  /* Los ingresos: verde los programados y otro tono los demás registrados. */
  .pflow-income {
    fill: var(--viz-income);

    &.once {
      fill: var(--viz-free);
      opacity: 0.6;
    }
  }

  /* Bajo el total de ingresos: cuánto es programado y cuánto no. */
  .pflow-split {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;

    & :global(.money) {
      color: var(--text-secondary);
      font-weight: 600;
    }
  }

  .pflow-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 2px;
    background: var(--viz-income);

    &.once {
      background: var(--viz-free);
      opacity: 0.6;
    }
  }

  .pflow-node {
    fill: var(--seg);
  }

  .pflow-band {
    fill: var(--seg);
    opacity: 0.28;
  }

  .seg-fixed {
    --seg: var(--viz-expense);
  }

  .seg-save {
    --seg: var(--viz-saving);
  }

  .seg-card {
    --seg: var(--viz-card);
  }

  .seg-other {
    --seg: var(--text-muted);
  }

  .seg-free {
    --seg: var(--viz-free);
  }

  .seg-short {
    --seg: var(--viz-expense);

    &.pflow-band {
      opacity: 0.14;
    }
  }

  .fixed-row {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-8) var(--sp-4);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    & + .fixed-row {
      border-top: var(--border-width) solid var(--border);
    }

    &:hover {
      background: var(--bg-hover);
    }

    &.paused {
      opacity: 0.5;
    }
  }

  .fixed-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .fixed-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .fixed-sub {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .fixed-amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-weight: 600;
  }

</style>
