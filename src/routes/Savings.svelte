<!--
  Ahorros: bolsillos con aporte mensual y, si se quiere, compartidos con
  otras personas. Arriba la tabla, y cada ahorro se abre en sus abonos y
  retiros; debajo, la gráfica de lo marcado: lo que ha tenido y cuánto habrá
  en N meses.
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
  import type { Saving, SavingMovement } from "../lib/types";

  let formOpen = $state(false);
  let editing = $state<Saving | null>(null);
  let movOpen = $state(false);
  let movSaving = $state<Saving | null>(null);
  let movEditing = $state<SavingMovement | null>(null);

  /** Registrar uno nuevo (`m` vacío) o corregir `m`. */
  function openMovement(s: Saving | null, m: SavingMovement | null = null) {
    movSaving = s;
    movEditing = m;
    movOpen = true;
  }

  /** Quien lo hizo o el dueño del ahorro, como en las reglas de la colección. */
  const canEdit = (m: SavingMovement) => m.created_by === session.id || store.saving(m.saving)?.owner === session.id;
  let showArchived = $state(false);
  let horizon = $state(24);

  // Los ahorros abiertos en la tabla (con sus abonos y retiros debajo). Se
  // recuerdan en este navegador.
  const OPEN_KEY = "finanzas-ahorros-abiertos";
  const opened = new SvelteSet<string>(readOpened());
  function readOpened(): string[] {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    } catch {
      return [];
    }
  }
  function toggleOpen(id: string) {
    if (opened.has(id)) opened.delete(id);
    else opened.add(id);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
    } catch {
      // Sin almacenamiento, vale para esta visita.
    }
  }

  /**
   * Los movimientos de cada ahorro, del más nuevo al más viejo, con lo que
   * tenía el ahorro después de cada uno: así se lee cómo llegó a su total.
   */
  const movsBySaving = $derived.by(() => {
    const map = new Map<string, { m: SavingMovement; after: number }[]>();
    // store.movements viene del más nuevo al más viejo: la suma corre al revés.
    const run = new Map<string, number>();
    for (let i = store.movements.length - 1; i >= 0; i--) {
      const m = store.movements[i];
      const after = (run.get(m.saving) ?? 0) + m.amount;
      run.set(m.saving, after);
      let list = map.get(m.saving);
      if (!list) map.set(m.saving, (list = []));
      list.unshift({ m, after });
    }
    return map;
  });
  // Muchos movimientos: los últimos, y el resto con "Ver todos".
  const SHOWN = 8;
  const expandedAll = new SvelteSet<string>();

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

  const selIds = $derived(new Set(simulated.map((s) => s.id)));
  const selCurrent = $derived(simulated.reduce((a, s) => a + store.savingCurrent(s.id), 0));

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

  function movsCount(id: string) {
    const n = movsBySaving.get(id)?.length ?? 0;
    return n ? `${n} ${n === 1 ? "movimiento" : "movimientos"}` : "Sin movimientos";
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
    {#if list.length}
      <div class="sv-table-wrap card">
        <table class="sv-table">
          <thead>
            <tr>
              <th class="sv-check">
                <button
                  type="button"
                  class="sv-plot"
                  class:on={allOn}
                  class:some={!allOn && simulated.length > 0}
                  aria-pressed={allOn}
                  aria-label={allOn ? "Ocultar todos de la gráfica" : "Agregar todos a la gráfica"}
                  data-tip={allOn ? "Ocultar todos de la gráfica" : "Agregar todos a la gráfica"}
                  onclick={toggleAll}
                >
                  <Icon name="activity-01" size={16} />
                </button>
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
                  <button
                    type="button"
                    class="sv-plot"
                    class:on={selIds.has(s.id)}
                    aria-pressed={selIds.has(s.id)}
                    aria-label={selIds.has(s.id) ? `Ocultar ${s.name} de la gráfica` : `Agregar ${s.name} a la gráfica`}
                    data-tip={selIds.has(s.id) ? "Ocultar de la gráfica" : "Agregar a la gráfica"}
                    onclick={() => toggle(s)}
                  >
                    <Icon name="activity-01" size={16} />
                  </button>
                </td>
                <td class="sv-name">
                  <!-- Abre o cierra sus abonos y retiros, debajo de la fila. -->
                  <button type="button" class="sv-toggle" aria-expanded={opened.has(s.id)} aria-controls="sv-movs-{s.id}" onclick={() => toggleOpen(s.id)}>
                    <Icon name="arrow-right-01" size={14} class="sv-chevron" />
                    <span class="sv-ico"><Icon name={s.icon || "piggy-bank"} size={15} /></span>
                    <span class="sv-name-text">
                      <span class="sv-title">{s.name}<ColorDot color={s.palette} /></span>
                      <span class="sv-sub">{movsCount(s.id)}</span>
                    </span>
                  </button>
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
                  <!-- Dónde está, según sus movimientos. -->
                  {#if store.savingAccounts(s.id).length}
                    <span class="alloc-chips">
                      {#each store.savingAccounts(s.id) as a (a.account)}
                        {@const acc = store.account(a.account)}
                        <span class="alloc-chip"
                          ><i style:background={colorOf(acc?.palette)}></i>{a.account ? (acc?.name ?? "Otra cuenta") : "Sin cuenta"}
                          <Money value={a.amount} /></span
                        >
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
                    <Button size="sm" variant="secondary" onclick={() => openMovement(s)}><Icon name="add-circle" />Movimiento</Button>
                    <Button size="sm" variant="ghost" aria-label="Editar" onclick={() => ((editing = s), (formOpen = true))}><Icon name="edit-02" /></Button>
                  </span>
                </td>
              </tr>
              {#if opened.has(s.id)}
                {@const movs = movsBySaving.get(s.id) ?? []}
                <tr class="sv-detail" class:sv-archived={s.archived} id="sv-movs-{s.id}">
                  <td colspan="7">
                    {#if movs.length}
                      <table class="movs" aria-label="Abonos y retiros de {s.name}">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Movimiento</th>
                            <th>Cuenta</th>
                            <th class="num">Valor</th>
                            <th class="num"><span data-tip="Lo que tenía el ahorro después de este movimiento">Quedó en</span></th>
                            <th><span class="sr-only">Acciones</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each expandedAll.has(s.id) ? movs : movs.slice(0, SHOWN) as { m, after } (m.id)}
                            {@const acc = store.account(m.account)}
                            <!-- Toda la fila abre el movimiento para corregirlo; el de otra persona solo se ve. -->
                            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
                            <tr class:editable={canEdit(m)} onclick={() => canEdit(m) && openMovement(s, m)}>
                              <td class="mov-date">{dateShort(m.date)} {m.date.slice(0, 4)}</td>
                              <td class="mov-what">
                                <span class="mov-kind" class:out={m.amount < 0}>
                                  <Icon name={m.amount < 0 ? "trade-down" : "trade-up"} size={13} />{m.amount < 0 ? "Retiro" : "Aporte"}
                                </span>
                                {#if m.note && m.note !== "Aporte" && m.note !== "Retiro"}<span class="mov-note">{m.note}</span>{/if}
                              </td>
                              <td class="mov-acc">
                                <span class="alloc-chip"><i style:background={colorOf(acc?.palette)}></i>{accountName(m.account)}</span>
                              </td>
                              <td class="num"><Money value={m.amount} tone="auto" /></td>
                              <td class="num mov-after"><Money value={after} /></td>
                              <td class="mov-actions">
                                {#if canEdit(m)}
                                  <button
                                    type="button"
                                    class="btn-icon sm"
                                    aria-label="Modificar"
                                    data-tip="Modificar"
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      openMovement(s, m);
                                    }}><Icon name="edit-02" size={14} /></button
                                  >
                                  <button
                                    type="button"
                                    class="btn-icon sm"
                                    aria-label="Borrar"
                                    data-tip="Borrar"
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      removeMovement(m.id);
                                    }}><Icon name="delete-02" size={14} /></button
                                  >
                                {/if}
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                      {#if movs.length > SHOWN && !expandedAll.has(s.id)}
                        <button type="button" class="link small mov-more" onclick={() => expandedAll.add(s.id)}>Ver los {movs.length} movimientos</button>
                      {/if}
                    {:else}
                      <p class="mov-empty">
                        Todavía no hay abonos ni retiros.
                        <button type="button" class="link" onclick={() => openMovement(s)}>Registrar el primero</button>
                      </p>
                    {/if}
                  </td>
                </tr>
              {/if}
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
        No hay ahorros registrados. Crea uno y define cuánto guardarás al mes.
      </div>
    {/if}

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
  </div>
</div>

<SavingForm open={formOpen} saving={editing} onClose={() => (formOpen = false)} />
<MovementForm open={movOpen} saving={movSaving} movement={movEditing} onClose={() => (movOpen = false)} />

<style>
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
      display: inline-flex;
      align-items: center;
      gap: var(--sp-6);
      font-weight: 600;
    }
  }

  .sv-check {
    width: 1%;
    padding-right: 0 !important;
  }

  /* Encendido: el ahorro sale en la gráfica. */
  .sv-plot {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    opacity: 0.35;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      opacity: 1;
    }

    &.some {
      color: var(--vivid-blue);
      opacity: 1;
    }

    &.on {
      --on-blue: light-dark(oklch(0.55 0.22 258), oklch(0.7 0.2 255));
      background: color-mix(in oklab, var(--on-blue) 40%, transparent);
      box-shadow: inset 0 0 0 1px var(--on-blue);
      color: light-dark(oklch(0.4 0.2 260), oklch(0.93 0.07 255));
      opacity: 1;
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

  .alloc-chip {
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

  /* El nombre abre sus movimientos: la flecha gira al abrir. */
  .sv-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    vertical-align: middle;

    & :global(.sv-chevron) {
      color: var(--text-muted);
      transition: transform 0.15s;
    }

    &[aria-expanded="true"] :global(.sv-chevron) {
      transform: rotate(90deg);
    }

    &:hover .sv-title {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .sv-name-text {
    display: flex;
    flex-direction: column;
  }

  /* La fila abierta: sus movimientos, en una tabla más chica que ocupa todo
     el ancho, sin marco: solo las líneas entre filas, de lado a lado. */
  .sv-table tbody tr.sv-detail > td {
    padding: 0;
    border-top: 0;
    white-space: normal;
  }

  .sv-table tbody tr:has(+ .sv-detail) > td,
  .sv-detail > td {
    background: color-mix(in oklab, var(--accent) 4%, transparent);
  }

  .movs {
    width: 100%;
    border-collapse: collapse;

    & th {
      padding: var(--sp-6) var(--sp-12) !important;
      border-top: var(--border-width) solid var(--border);
      font-size: 0.6875rem;
    }

    & td {
      padding: var(--sp-6) var(--sp-12) !important;
      border-top: var(--border-width) solid var(--border);
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    & tr.editable {
      cursor: pointer;

      &:hover td {
        background: var(--bg-hover);
      }
    }

    & .num :global(.money) {
      font-weight: 600;
    }
  }

  .mov-date {
    width: 1%;
    color: var(--text-muted) !important;
    font-variant-numeric: tabular-nums;
  }

  .mov-what {
    width: 100%;
  }

  .mov-kind {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 600;
    color: var(--success);

    &.out {
      color: var(--danger);
    }
  }

  .mov-note {
    margin-left: var(--sp-8);
    color: var(--text-secondary);
  }

  .mov-after :global(.money) {
    font-weight: 500 !important;
    color: var(--text-muted);
  }

  .mov-actions {
    width: 1%;
    white-space: nowrap;

    & > .btn-icon {
      display: inline-grid;
      vertical-align: middle;
    }

    & .btn-icon {
      opacity: 0.6;
    }

    & .btn-icon:hover {
      opacity: 1;
    }
  }

  .mov-more {
    margin: 0 var(--sp-12) var(--sp-8);
  }

  .mov-empty {
    margin: 0;
    padding: var(--sp-10) var(--sp-12);
    border-top: var(--border-width) solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
