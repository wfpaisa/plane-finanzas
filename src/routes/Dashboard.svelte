<!--
  Resumen: cuánto hay, cómo va el mes, en qué se va la plata y cómo van los
  ahorros. Lo primero que se ve al entrar.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";

  import Money from "../components/app/Money.svelte";
  import TransactionList from "../components/app/TransactionList.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button } from "../components/ui";
  import { alpha, colorsFor, tintColor, token } from "../lib/colors";
  import { addMonths, bucketize, budgetUse, byCategory, monthRange, today } from "../lib/finance";
  import { money, monthLabel } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { colorOf, tintFor } from "../lib/palettes";
  import { pb, session } from "../lib/pb.svelte";
  import { go } from "../lib/router.svelte";
  import { store } from "../lib/store.svelte";
  import { byTag, FIXED_TAG, hasTag, tagsOf } from "../lib/tags";
  import type { Transaction } from "../lib/types";
  import { txModal } from "../lib/ui.svelte";

  const ym = today().slice(0, 7);
  const from = `${addMonths(ym, -5)}-01`;
  const [, nextMonth] = monthRange(ym);

  let txs = $state<Transaction[]>([]);
  let loading = $state(true);

  $effect(() => {
    void store.txVersion;
    // Una respuesta que llega tarde no pisa la de una recarga más nueva.
    let alive = true;
    pb.collection("transactions")
      .getFullList<Transaction>({
        filter: pb.filter("date >= {:from} && date < {:to}", { from, to: nextMonth }),
        sort: "-date,-created",
        expand: "rule",
      })
      .then((r) => alive && (txs = r))
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  const month = $derived(txs.filter((t) => t.date.slice(0, 7) === ym));
  const income = $derived(month.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0));
  const monthExpenses = $derived(month.filter((t) => t.type === "expense"));
  const expense = $derived(monthExpenses.reduce((s, t) => s + t.amount, 0));
  const plan = $derived(store.plan);
  // Contra lo libre van los gastos variables: los que no llevan #fijo (propia
  // o de su categoría), como en el móvil. Ver `budgetUse`.
  const use = $derived(budgetUse(plan, monthExpenses.map((t) => ({ amount: t.amount, fixed: hasTag(t, FIXED_TAG) }))));
  const budget = $derived(use.budget);
  const left = $derived(use.left);
  const pctUsed = $derived(use.pct);
  const review = $derived(month.filter((t) => t.tags?.includes("revisar")).length);

  const months = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  const buckets = $derived(bucketize(txs, "month", months));
  // "¿En qué gastaste?": primero por etiqueta de la categoría; al elegir una,
  // sus categorías. `null` es arriba; "" es "sin etiqueta".
  let catTag = $state<string | null>(null);
  const tagRows = $derived(byTag(monthExpenses));
  const showTags = $derived(catTag === null && tagRows.some((r) => r.tag));
  const cats = $derived(
    byCategory(
      catTag === null ? month : monthExpenses.filter((t) => (catTag ? hasTag(t, catTag) : !tagsOf(t).length)),
      "expense",
    ),
  );

  const firstName = $derived((session.user?.name || "").split(" ")[0]);

  const flowConfig = (): ChartConfiguration => {
    const inc = token("--viz-income");
    const exp = token("--viz-expense");
    return {
      type: "line",
      data: {
        labels: buckets.map((b) => monthLabel(b.key)),
        datasets: [
          {
            label: "Ingresos",
            data: buckets.map((b) => b.income),
            borderColor: inc,
            backgroundColor: alpha(inc, 0.08),
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
          },
          {
            label: "Gastos",
            data: buckets.map((b) => b.expense),
            borderColor: exp,
            backgroundColor: alpha(exp, 0.08),
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
          },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
        },
        plugins: {
          legend: { position: "top", align: "end" },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
        },
      },
    };
  };

  const doughnutConfig = (): ChartConfiguration => {
    const top = cats.slice(0, 7);
    const rest = cats.slice(7).reduce((s, c) => s + c.total, 0);
    const labels = top.map((c) => store.category(c.category)?.name ?? "Sin categoría");
    // Cada categoría en su color; "Otras", en gris.
    const colors = colorsFor(top.map((c) => store.category(c.category)?.color));
    if (rest > 0) colors.push(token("--viz-muted"));
    const data = top.map((c) => c.total);
    if (rest > 0) {
      labels.push("Otras");
      data.push(rest);
    }
    return {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: token("--bg-level2"), borderWidth: 2, hoverOffset: 6 }] },
      options: {
        cutout: "68%",
        plugins: {
          legend: { position: "right" },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(Number(c.raw))}` } },
        },
      },
    } as ChartConfiguration;
  };

  // Las etiquetas también en dona. Tocar una parte, o su nombre en la
  // leyenda, abre sus categorías.
  const tagDoughnutConfig = (): ChartConfiguration => {
    const rows = tagRows;
    const open = (i: number | undefined) => {
      if (i !== undefined && rows[i]) catTag = rows[i].tag;
    };
    return {
      type: "doughnut",
      data: {
        labels: rows.map((r) => (r.tag ? `#${r.tag}` : "Sin etiqueta")),
        datasets: [
          {
            data: rows.map((r) => r.total),
            backgroundColor: rows.map((r) => (r.tag ? tintColor(tintFor(r.tag)) : token("--viz-muted"))),
            borderColor: token("--bg-level2"),
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        cutout: "68%",
        onClick: (_e, els) => open(els[0]?.index),
        onHover: (e, els) => {
          const el = e.native?.target as HTMLElement | undefined;
          if (el) el.style.cursor = els.length ? "pointer" : "default";
        },
        plugins: {
          legend: { position: "right", onClick: (_e, item) => open(item.index) },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(Number(c.raw))}` } },
        },
      },
    } as ChartConfiguration;
  };

  const savingsList = $derived(
    store.activeSavings.slice(0, 5).map((s) => ({ s, current: store.savingCurrent(s.id) })),
  );
  /** Sin meta, la barra se mide contra el ahorro más grande. */
  const savingsMax = $derived(Math.max(0, ...savingsList.map((x) => x.current)));
</script>

<div class="page page-wide">
  <header class="page-head">
    <div>
      <h1>Hola{firstName ? `, ${firstName}` : ""}</h1>
      <p>Así va {monthLabel(ym, true)}.</p>
    </div>
    <div class="page-actions">
      {#if review > 0}
        <Button
          variant="warning"
          tipSide="bottom"
          tip="Llegaron de tus correos, pero la app no supo con certeza a qué cuenta o categoría van, y los marcó con #revisar. Ábrelos, corrige la cuenta o la categoría y quita la etiqueta #revisar para darlos por revisados."
          onclick={() => go("/movimientos", { tag: "revisar" })}
        >
          <Icon name="alert-02" />{review} {review === 1 ? "movimiento pendiente" : "movimientos pendientes"}
        </Button>
      {/if}
      <Button variant="secondary" onclick={() => txModal.new()}><Icon name="add-01" />Agregar</Button>
    </div>
  </header>

  <div class="stack dash">
    <div class="kpis-auto">
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico"><Icon name="wallet-01" /></span><span class="kpi-label">Dinero total</span></div>
        <div class="kpi-val"><Money value={store.total} /></div>
        <div class="kpi-foot">{store.activeAccounts.length} cuentas</div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-income"><Icon name="money-receive-01" /></span><span class="kpi-label">Ingresos del mes</span></div>
        <div class="kpi-val"><Money value={income} tone="income" /></div>
        <div class="kpi-foot">Plan: <Money value={plan.income} /></div>
      </div>
      <div class="card kpi">
        <div class="kpi-head"><span class="kpi-ico tone-expense"><Icon name="money-send-01" /></span><span class="kpi-label">Gastos del mes</span></div>
        <div class="kpi-val"><Money value={expense} tone="expense" /></div>
      </div>
      <div class="card kpi">
        <div class="kpi-head">
          <span class="kpi-ico {left < 0 ? 'tone-expense' : left < budget * 0.15 ? 'tone-warn' : 'tone-income'}"><Icon name="coins-01" /></span>
          <span class="kpi-label">{left >= 0 ? "Disponible para otros gastos" : "Gastaste de más"}</span>
        </div>
        <div class="kpi-val"><Money value={Math.abs(left)} tone={left < 0 ? "expense" : undefined} /></div>
        <progress class="progress" max="100" value={pctUsed}></progress>
        <div class="kpi-foot">Has usado {Math.round(pctUsed)}% de lo disponible: <Money value={budget} /></div>
        {#if use.fixedOver > 0}
          <div class="kpi-foot">Incluye <Money value={use.fixedOver} /> de gastos fijos por encima de lo planeado.</div>
        {/if}
      </div>
    </div>

    <div class="dash-grid">
      <div class="card dash-flow">
        <div class="card-head">
          <div>
            <h3 class="card-title">Dinero que entró y salió</h3>
            <p class="card-sub">Últimos 6 meses</p>
          </div>
        </div>
        <div class="card-body">
          {#if !loading}<Chart config={flowConfig} label="Ingresos y gastos por mes" />{/if}
        </div>
      </div>
      <div class="card dash-cats">
        <div class="card-head">
          {#if catTag !== null}
            <button type="button" class="btn-icon sm btn-rounded" aria-label="Volver a las etiquetas" onclick={() => (catTag = null)}>
              <Icon name="arrow-left-01" />
            </button>
          {/if}
          <div class="flex-1">
            <h3 class="card-title">{catTag === null ? "¿En qué gastaste?" : catTag ? `#${catTag}` : "Sin etiqueta"}</h3>
            <p class="card-sub">
              {catTag === null ? `Gastos de ${monthLabel(ym, true)}` : "Sus categorías este mes"}
            </p>
          </div>
          <div class="card-head-actions"><a class="link small" href="#/estados">Ver análisis</a></div>
        </div>
        <div class="card-body">
          {#if showTags}
            <Chart config={tagDoughnutConfig} height={240} label="Gastos del mes por etiqueta" />
            <p class="small muted tag-note">Toca una etiqueta para ver sus categorías. Un gasto con varias etiquetas suma en cada una.</p>
          {:else if cats.length}
            {#key catTag}
              <Chart config={doughnutConfig} height={240} label="Gastos del mes por categoría" />
            {/key}
          {:else}
            <div class="empty-card">Todavía no hay gastos este mes.</div>
          {/if}
        </div>
      </div>

      <div class="card dash-txs">
        <div class="card-head">
          <div><h3 class="card-title">Últimos movimientos</h3></div>
          <div class="card-head-actions"><a class="link small" href="#/movimientos">Ver todos</a></div>
        </div>
        <div class="card-body">
          {#if txs.length}
            <TransactionList items={txs.slice(0, 8)} onOpen={(t) => txModal.edit(t)} />
          {:else if !loading}
            <div class="empty-card">
              Sin movimientos todavía. Agrega uno con <b>+</b> o <a class="link" href="#/importar">impórtalos de Gmail</a>.
            </div>
          {/if}
        </div>
      </div>

      <div class="card dash-savings">
        <div class="card-head">
          <div>
            <h3 class="card-title">Ahorros</h3>
            <p class="card-sub"><Money value={plan.savings} /> al mes</p>
          </div>
          <div class="card-head-actions"><a class="link small" href="#/ahorros">Ver</a></div>
        </div>
        <div class="card-body">
          {#if savingsList.length}
            <!-- Como "Por categoría" en Análisis: ver `.cr` en styles/app.css. -->
            <ul class="cr-list">
              {#each savingsList as { s, current } (s.id)}
                {@const target = s.target_amount || 0}
                {@const pct = target ? (current / target) * 100 : 0}
                <li class="cr" style:--tinte={colorOf(s.palette)}>
                  <a class="cr-main" href="#/ahorros">
                    <span class="cr-ico"><Icon name={s.icon || "piggy-bank"} size={16} /></span>
                    <span class="cr-text">
                      <span class="cr-name">{s.name}</span>
                      <span class="cr-meta">
                        {#if s.monthly_amount}<Money value={s.monthly_amount} /> al mes{:else}Sin aporte mensual{/if}{#if s.target_date}
                          · meta en {monthLabel(s.target_date.slice(0, 7), true)}{/if}
                      </span>
                    </span>
                    <span class="cr-amount">
                      <Money value={current} />
                      <span class="cr-meta">{target ? `${Math.floor(pct)}%` : "Sin meta"}</span>
                    </span>
                    <span class="cr-bar">
                      <span style:width="{target ? Math.min(100, pct) : savingsMax ? (current / savingsMax) * 100 : 0}%"></span>
                    </span>
                    {#if target}
                      <span class="cr-budget">
                        {#if current >= target}Meta cumplida: <Money value={target} />
                        {:else}Faltan <Money value={target - current} /> de <Money value={target} />{/if}
                      </span>
                    {/if}
                  </a>
                  <a class="btn-icon sm cr-go" href="#/ahorros" aria-label="Ver {s.name}" data-tip="Ver ahorro">
                    <Icon name="arrow-right-01" size={14} />
                  </a>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="empty-card">No hay ahorros registrados. Crea uno para consultar su avance.</div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* Las medidas se toman del ancho del resumen, no de la ventana: así se
     acomoda igual con el sidebar abierto o cerrado. */
  .dash {
    container-type: inline-size;
  }

  /* Angosto: una columna. Mediano: el flujo a todo el ancho y debajo los
     movimientos, con "¿En qué gastaste?" sobre los ahorros al lado. Ancho:
     tres columnas; el flujo ocupa dos y los gastos van encima de los ahorros. */
  .dash-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "flow" "txs" "cats" "savings";
    gap: var(--card-gap);

    & > .dash-flow {
      grid-area: flow;
    }

    & > .dash-cats {
      grid-area: cats;
    }

    & > .dash-txs {
      grid-area: txs;
    }

    & > .dash-savings {
      grid-area: savings;
    }

    @container (min-width: 44rem) {
      grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
      grid-template-areas:
        "flow flow"
        "txs cats"
        "txs savings";
      align-items: start;
    }

    @container (min-width: 96rem) {
      grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "flow flow cats"
        "txs txs savings";
    }
  }

  .tag-note {
    margin: var(--sp-8) 0 0;
  }

  .kpi .progress {
    height: 0.375rem;
  }
</style>
