<!--
  Ahorros: bolsillos con aporte mensual, repartidos entre cuentas y, si se
  quiere, compartidos con otras personas. Cada uno con su simulador: cuánto
  habrá en N meses y cuándo se llega a la meta.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { SvelteSet } from "svelte/reactivity";

  import Money from "../components/app/Money.svelte";
  import ColorDot from "../components/app/ColorDot.svelte";
  import MovementForm from "../components/app/MovementForm.svelte";
  import SavingForm from "../components/app/SavingForm.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Switch } from "../components/ui";
  import { alpha, resolveColor, token } from "../lib/colors";
  import { addMonths, futureValue, monthsToTarget, today } from "../lib/finance";
  import { dateShort, money, monthLabel, monthsLabel } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { colorOf } from "../lib/palettes";
  import { pb, session } from "../lib/pb.svelte";
  import { reload, store } from "../lib/store.svelte";
  import type { Saving } from "../lib/types";

  let formOpen = $state(false);
  let editing = $state<Saving | null>(null);
  let movOpen = $state(false);
  let movSaving = $state<Saving | null>(null);
  let showArchived = $state(false);
  let horizon = $state(24);

  // Abrir o cerrar "Abonos y retiros" se recuerda en este navegador.
  const MOVS_KEY = "finanzas-ahorros-movs";
  let showMovs = $state(readShowMovs());
  function readShowMovs() {
    try {
      return localStorage.getItem(MOVS_KEY) !== "0";
    } catch {
      return true;
    }
  }
  function toggleMovs() {
    showMovs = !showMovs;
    try {
      localStorage.setItem(MOVS_KEY, showMovs ? "1" : "0");
    } catch {
      // Sin almacenamiento, vale para esta visita.
    }
  }

  const list = $derived(store.savings.filter((s) => showArchived || !s.archived));
  const totalSaved = $derived(store.activeSavings.reduce((s, x) => s + store.savingCurrent(x.id), 0));
  const totalMonthly = $derived(store.activeSavings.reduce((s, x) => s + (x.monthly_amount || 0), 0));
  const ym = today().slice(0, 7);

  function eta(s: Saving, current: number) {
    if (!s.target_amount) return null;
    const m = monthsToTarget(current, s.monthly_amount || 0, s.annual_rate || 0, s.target_amount);
    return m === null ? null : { months: m, month: addMonths(ym, m) };
  }


  // La gráfica y los movimientos muestran los ahorros marcados en la tabla;
  // al entrar, todos. Se guarda lo desmarcado para que un ahorro nuevo
  // entre marcado. La gráfica dibuja una línea por ahorro y otra con el total.
  const excluded = new SvelteSet<string>();
  const simulated = $derived(list.filter((s) => !excluded.has(s.id)));
  const selected = $derived(simulated[0] ?? null);
  const multi = $derived(simulated.length > 1);
  const allOn = $derived(simulated.length === list.length);

  function toggle(s: Saving) {
    if (excluded.has(s.id)) excluded.delete(s.id);
    else excluded.add(s.id);
  }

  function toggleAll() {
    if (allOn) list.forEach((s) => excluded.add(s.id));
    else excluded.clear();
  }

  // "Abonos y retiros" lista lo de todos los ahorros que están en la gráfica.
  const selIds = $derived(new Set(simulated.map((s) => s.id)));
  const selCurrent = $derived(simulated.reduce((a, s) => a + store.savingCurrent(s.id), 0));
  const selMovs = $derived(store.movements.filter((m) => selIds.has(m.saving)));
  const byAccount = $derived.by(() => {
    const map = new Map<string, number>();
    for (const m of selMovs) map.set(m.account, (map.get(m.account) ?? 0) + m.amount);
    return [...map.entries()].filter(([, v]) => v !== 0);
  });

  const valueAt = (s: Saving, months: number) =>
    futureValue(store.savingCurrent(s.id), s.monthly_amount || 0, s.annual_rate || 0, months);
  const paidAt = (s: Saving, months: number) => store.savingCurrent(s.id) + (s.monthly_amount || 0) * months;
  // La gráfica tiene dos vistas: lo que ha tenido cada ahorro (estado) y lo
  // que tendría si sigue aportando (simulación).
  let view = $state<"estado" | "sim">("estado");

  /** Saldo de cada ahorro al cierre de cada mes, desde su primer movimiento
   *  (y al menos los últimos 6 meses) hasta hoy. */
  const history = $derived.by(() => {
    const ids = new Set(simulated.map((s) => s.id));
    const movs = store.movements.filter((m) => ids.has(m.saving));
    const first = movs.reduce((a, m) => (m.date.slice(0, 7) < a ? m.date.slice(0, 7) : a), addMonths(ym, -5));
    const months: string[] = [];
    for (let m = first; m <= ym; m = addMonths(m, 1)) months.push(m);
    // Lo de cada mes y luego la suma corrida: una pasada, no una por mes.
    const lines = simulated.map((s) => {
      const byMonth = new Map<string, number>();
      for (const m of movs) {
        if (m.saving === s.id) byMonth.set(m.date.slice(0, 7), (byMonth.get(m.date.slice(0, 7)) ?? 0) + m.amount);
      }
      let sum = 0;
      return { s, data: months.map((mo) => (sum += byMonth.get(mo) ?? 0)) };
    });
    return { months, lines };
  });
  const nowTotal = $derived(simulated.reduce((a, s) => a + store.savingCurrent(s.id), 0));
  const grown = $derived(nowTotal - history.lines.reduce((a, l) => a + l.data[0], 0));

  const simMonthly = $derived(simulated.reduce((a, s) => a + (s.monthly_amount || 0), 0));
  const future = $derived(simulated.reduce((a, s) => a + valueAt(s, horizon), 0));
  const contributed = $derived(simulated.reduce((a, s) => a + paidAt(s, horizon), 0));

  const chartConfig = (): ChartConfiguration =>
    view === "estado" ? stateConfig() : multi ? multiConfig() : singleConfig();

  /** Lo que ha tenido: una línea por ahorro y, con varios, el total. */
  const stateConfig = (): ChartConfiguration => {
    const labels = history.months.map((m) => monthLabel(m));
    const ink = token("--text-primary");
    const one = history.lines.length === 1;
    const lines = history.lines.map(({ s, data }) => {
      const color = resolveColor(colorOf(s.palette));
      return {
        label: s.name,
        data,
        borderColor: color,
        backgroundColor: alpha(color, 0.08),
        fill: one,
        borderWidth: one ? 2 : 1.75,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0,
      };
    });
    const total = labels.map((_, i) => history.lines.reduce((a, l) => a + l.data[i], 0));
    return {
      type: "line",
      data: {
        labels,
        datasets: one
          ? lines
          : [
              {
                label: "Total",
                data: total,
                borderColor: ink,
                backgroundColor: alpha(ink, 0.06),
                fill: true,
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0,
              },
              ...lines,
            ],
      },
      options: lineOptions(),
    };
  };

  const lineOptions = (): ChartConfiguration["options"] => ({
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
      y: { ticks: { callback: (v) => money(Number(v)) }, border: { display: false } },
    },
    plugins: {
      legend: { position: "top", align: "end" },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.raw))}` } },
    },
  });

  /** Varios ahorros: una línea por cada uno, en su color, y el total encima. */
  const multiConfig = (): ChartConfiguration => {
    const labels = Array.from({ length: horizon + 1 }, (_, i) => monthLabel(addMonths(ym, i)));
    const lines = simulated.map((s) => ({ s, data: labels.map((_, i) => valueAt(s, i)) }));
    const total = labels.map((_, i) => lines.reduce((a, l) => a + l.data[i], 0));
    // El total en tinta, no en color: así no se confunde con ningún ahorro.
    const ink = token("--text-primary");
    return {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Total",
            data: total,
            borderColor: ink,
            backgroundColor: alpha(ink, 0.06),
            fill: true,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.25,
          },
          ...lines.map(({ s, data }) => ({
            label: s.name,
            data,
            borderColor: resolveColor(colorOf(s.palette)),
            borderWidth: 1.75,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
          })),
        ],
      },
      options: lineOptions(),
    };
  };

  const singleConfig = (): ChartConfiguration => {
    const s = simulated[0];
    // El ahorro en su color; la comparación sin intereses y la meta, en
    // gris, para que no se confundan con él.
    const c1 = resolveColor(colorOf(s.palette));
    const c2 = token("--viz-muted");
    const labels: string[] = [];
    const withRate: number[] = [];
    const plain: number[] = [];
    for (let i = 0; i <= horizon; i++) {
      labels.push(monthLabel(addMonths(ym, i)));
      withRate.push(valueAt(s, i));
      plain.push(paidAt(s, i));
    }
    const datasets: ChartConfiguration<"line">["data"]["datasets"] = [
      {
        label: s.annual_rate ? `Con interés anual del ${s.annual_rate}%` : "Cantidad estimada",
        data: withRate,
        borderColor: c1,
        backgroundColor: alpha(c1, 0.08),
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.25,
      },
    ];
    if (s.annual_rate) {
      datasets.push({ label: "Sin intereses", data: plain, borderColor: c2, borderDash: [5, 4], borderWidth: 2, pointRadius: 0, fill: false });
    }
    if (s.target_amount) {
      datasets.push({
        label: "Meta",
        data: labels.map(() => s.target_amount),
        borderColor: token("--text-muted"),
        borderDash: [2, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      });
    }
    return {
      type: "line",
      data: { labels, datasets },
      options: lineOptions(),
    };
  };

  async function removeMovement(id: string) {
    try {
      await pb.collection("saving_movements").delete(id);
      await reload("savings");
    } catch (err) {
      notify.fail(err);
    }
  }

  const accountName = (id: string) => store.account(id)?.name ?? (id ? "Cuenta de otra persona" : "Sin cuenta");
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Ahorros</h1>
      <p>Total ahorrado: <b><Money value={totalSaved} /></b> · Aporte mensual: <b><Money value={totalMonthly} /></b></p>
    </div>
    <div class="page-actions">
      <Switch bind:checked={showArchived} label="Ver archivados" />
      <Button variant="secondary" onclick={() => ((editing = null), (formOpen = true))}><Icon name="add-01" />Nuevo ahorro</Button>
    </div>
  </header>

  <div class="stack">
    {#if list.length && !selected}
      <div class="card empty-card">Marca al menos un ahorro en la tabla para verlo en la gráfica.</div>
    {/if}
    {#if selected}
      <div class="card">
        <div class="card-head">
          <div>
            {#if multi}
              <h3 class="card-title"><Icon name="chart-line-data-01" /> {simulated.length} ahorros</h3>
              <p class="card-sub">{simulated.map((x) => x.name).join(" + ")}</p>
            {:else}
              <h3 class="card-title"><Icon name={selected.icon || "piggy-bank"} /> {selected.name}</h3>
              <p class="card-sub">
                {#if view === "estado"}Lo que ha tenido mes a mes, según sus abonos y retiros{:else}Si sigues aportando <Money value={selected.monthly_amount} /> al mes{/if}
              </p>
            {/if}
          </div>
          <div class="card-head-actions">
            <div class="chips" role="tablist" aria-label="Vista de la gráfica">
              <button type="button" role="tab" class="chip" class:active={view === "estado"} aria-selected={view === "estado"} onclick={() => (view = "estado")}>Estado</button>
              <button type="button" role="tab" class="chip" class:active={view === "sim"} aria-selected={view === "sim"} onclick={() => (view = "sim")}>Simulación</button>
            </div>
          </div>
        </div>
        <div class="card-body stack">
          {#if view === "estado"}
            <div class="sim-row">
              <span class="sim-slider">
                <span>Hoy{multi ? ", entre todos" : ""}</span>
                {#if grown}<span class="small muted">{grown > 0 ? "Creció" : "Bajó"} <Money value={Math.abs(grown)} /> desde {monthLabel(history.months[0], true)}</span>{/if}
              </span>
              <div class="sim-result"><Money value={nowTotal} /></div>
            </div>
          {:else}
            <div class="sim-row">
              <label class="sim-slider">
                <span>En <b>{monthsLabel(horizon)}</b> ({monthLabel(addMonths(ym, horizon), true)}){#if multi}, aportando <Money value={simMonthly} /> al mes entre todos{/if}</span>
                <input type="range" class="field-control" min="1" max="120" bind:value={horizon} />
              </label>
              <div class="sim-result">
                <Money value={future} />
                {#if future > contributed + 1}
                  <span class="small muted">Incluye <Money value={future - contributed} /> de intereses estimados</span>
                {/if}
              </div>
            </div>
          {/if}
          <Chart config={chartConfig} height={300} label={view === "estado" ? "Dinero ahorrado mes a mes" : "Cálculo del ahorro a futuro"} />
        </div>
      </div>
    {/if}

    {#if list.length}
      <div class="sv-table-wrap card">
        <table class="sv-table">
          <thead>
            <tr>
              <th class="sv-check">
                <input
                  type="checkbox"
                  aria-label="Marcar todos"
                  checked={allOn}
                  indeterminate={!allOn && simulated.length > 0}
                  onchange={toggleAll}
                />
              </th>
              <th>Ahorro</th>
              <th class="num">Al mes</th>
              <th>Cuentas</th>
              <th class="sv-goal-col">Meta</th>
              <th class="num">Ahorrado</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {#each list as s (s.id)}
              {@const current = store.savingCurrent(s.id)}
              {@const e = eta(s, current)}
              {@const pct = s.target_amount ? Math.min(100, Math.max(0, (current / s.target_amount) * 100)) : 0}
              <tr class:sv-archived={s.archived}>
                <td class="sv-check">
                  <input type="checkbox" aria-label="Ver {s.name} en la gráfica" checked={selIds.has(s.id)} onchange={() => toggle(s)} />
                </td>
                <td class="sv-name">
                  <span class="sv-ico"><Icon name={s.icon || "piggy-bank"} size={15} /></span>
                  <span class="sv-title">{s.name}</span>
                  <ColorDot color={s.palette} />
                  {#if s.members?.length || s.owner !== session.id}
                    <span class="sv-mark" data-tip="Compartido"><Icon name="user-multiple" size={14} /></span>
                  {/if}
                </td>
                <td class="num sv-cell">
                  <Money value={s.monthly_amount} />
                  <span class="sv-sub">
                    {s.annual_rate ? `${s.annual_rate}% anual` : ""}{s.annual_rate && s.auto ? " · " : ""}{s.auto ? "automático" : ""}
                  </span>
                </td>
                <td class="sv-cell">
                  {#if s.allocations?.length}
                    <span class="alloc-chips">
                      <!-- Por posición: un reparto viejo puede repetir cuenta. -->
                      {#each s.allocations as a, i (i)}
                        {@const acc = store.account(a.account)}
                        <span class="alloc-chip"><i style:background={colorOf(acc?.palette)}></i>{acc?.name ?? "Otra cuenta"} {a.percent}%</span>
                      {/each}
                    </span>
                  {:else}—{/if}
                </td>
                <td class="sv-goal-col sv-cell">
                  {#if s.target_amount}
                    <span class="sv-goal">
                      <span class="sv-goal-top"><span>{Math.round(pct)}% de <Money value={s.target_amount} /></span></span>
                      <span class="bar-track"><span style:width="{pct}%" style:background={colorOf(s.palette)}></span></span>
                      <span class="sv-sub">
                        {#if e && e.months === 0}Objetivo alcanzado{:else if e}Fecha estimada: {monthLabel(e.month)}{:else}Define un aporte para calcular la fecha estimada{/if}
                      </span>
                    </span>
                  {:else}—{/if}
                </td>
                <td class="num sv-amount"><Money value={current} /></td>
                <td class="sv-actions">
                  <span>
                    <Button size="sm" variant="secondary" onclick={() => ((movSaving = s), (movOpen = true))}><Icon name="add-circle" />Aportar</Button>
                    <Button size="sm" variant="ghost" aria-label="Editar" onclick={() => ((editing = s), (formOpen = true))}><Icon name="edit-02" /></Button>
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">
                {allOn ? list.length : `${simulated.length} de ${list.length}`}
                {list.length === 1 ? "ahorro" : "ahorros"}
              </td>
              <td class="num"><Money value={simMonthly} /></td>
              <td></td>
              <td class="sv-goal-col"></td>
              <td class="num"><Money value={selCurrent} /></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    {:else}
      <div class="card empty-card">
        No hay ahorros registrados. Crea uno y define el aporte mensual y las cuentas donde se guardará.
      </div>
    {/if}


    {#if selected}
      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Abonos y retiros</h3>
            <p class="card-sub">
              <Money value={selCurrent} /> en {byAccount.length === 1 ? "1 cuenta" : `${byAccount.length} cuentas`} · {selMovs.length}
              {selMovs.length === 1 ? "movimiento" : "movimientos"}
            </p>
          </div>
          <div class="card-head-actions">
            <Button size="sm" onclick={() => ((movSaving = selected), (movOpen = true))}><Icon name="add-01" />Movimiento</Button>
            <Button size="sm" variant="ghost" aria-expanded={showMovs} aria-controls="saving-movs" onclick={toggleMovs}>
              <Icon name={showMovs ? "arrow-up-01" : "arrow-down-01"} />{showMovs ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
        </div>
        {#if showMovs}
          <div class="card-body" id="saving-movs">
            <div class="by-account">
              {#each byAccount as [acc, amount] (acc)}
                <div class="bar-row">
                  <span class="acc-name"><i style:background={colorOf(store.account(acc)?.palette)}></i>{accountName(acc)}</span>
                  <Money value={amount} />
                </div>
              {/each}
            </div>
            <p class="eyebrow mov-title">Movimientos</p>
            <ul class="movs">
              {#each selMovs.slice(0, 30) as m (m.id)}
                <li>
                  <span class="mov-date">{dateShort(m.date)}</span>
                  <span class="mov-main">
                    <span>{m.note || (m.amount >= 0 ? "Aporte" : "Retiro")}</span>
                    <span class="small muted">
                      {#if multi}{store.saving(m.saving)?.name} · {/if}{accountName(m.account)}
                    </span>
                  </span>
                  <Money value={m.amount} tone="auto" />
                  {#if m.created_by === session.id || store.saving(m.saving)?.owner === session.id}
                    <button type="button" class="btn-icon sm" aria-label="Borrar" onclick={() => removeMovement(m.id)}>
                      <Icon name="delete-02" size={14} />
                    </button>
                  {/if}
                </li>
              {:else}
                <li class="muted small">Todavía no hay aportes.</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<SavingForm open={formOpen} saving={editing} onClose={() => (formOpen = false)} />
<MovementForm open={movOpen} saving={movSaving} onClose={() => (movOpen = false)} />

<style>
  /* Con el ancho completo, las cuentas del reparto van lado a lado. */
  .by-account {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0 var(--sp-24);
  }

  /* En angosto la tabla se desliza de lado dentro de su tarjeta. */
  .sv-table-wrap {
    padding: 0;
    overflow-x: auto;
  }

  .sv-table {
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
      padding: var(--sp-10) var(--sp-12);
      vertical-align: middle;
      white-space: nowrap;
    }

    & tbody tr {
      & + tr td {
        border-top: var(--border-width) solid var(--border);
      }

      &.sv-archived {
        opacity: 0.55;
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
  .sv-name {
    width: 100%;
    min-width: 12rem;

    & > * {
      vertical-align: middle;
    }

    & .sv-title {
      margin: 0 var(--sp-6) 0 var(--sp-10);
      font-weight: 600;
    }
  }

  .sv-check {
    width: 1%;
    padding-right: 0 !important;

    & input {
      display: block;
      width: 1rem;
      height: 1rem;
      margin: 0;
      accent-color: var(--accent);
      cursor: pointer;
    }
  }

  .sv-ico {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    background: var(--bg-field);
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .sv-mark {
    display: inline-flex;
    margin-left: var(--sp-6);
    color: var(--text-muted);
  }

  .sv-cell {
    color: var(--text-secondary);
    font-size: var(--text-xs);

    &.num :global(.money) {
      color: var(--text-primary);
    }
  }

  .sv-sub {
    display: block;
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-weight: 400;
  }

  .sv-goal-col {
    min-width: 13rem;
  }

  .sv-goal {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);

    & .bar-track {
      display: block;
    }
  }

  .sv-amount :global(.money) {
    font-size: var(--text-base, 1rem);
  }

  .sv-actions span {
    display: inline-flex;
    gap: var(--sp-4);
  }

  .alloc-chips {
    display: flex;
    flex-wrap: wrap;
    max-width: 18rem;
    gap: var(--sp-6);
  }

  .alloc-chip,
  .acc-name {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--text-xs);
    color: var(--text-secondary);

    & i {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 50%;
      background: var(--chart-1);
    }
  }

  .acc-name {
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .sim-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-16);
  }

  .sim-slider {
    display: flex;
    flex: 1;
    min-width: 14rem;
    flex-direction: column;
    gap: var(--sp-6);
    font-size: var(--text-sm);
  }

  .sim-result {
    display: flex;
    flex-direction: column;
    align-items: flex-end;

    & > :global(.money) {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
  }

  .mov-title {
    margin-top: var(--sp-16);
  }

  .movs {
    list-style: none;
    margin: 0;
    padding: 0;

    & li {
      display: flex;
      align-items: center;
      gap: var(--sp-10);
      padding: var(--sp-6) 0;
      font-size: var(--text-sm);

      & + li {
        border-top: var(--border-width) solid var(--border);
      }
    }
  }

  .mov-date {
    width: 3.5rem;
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .mov-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }
</style>
