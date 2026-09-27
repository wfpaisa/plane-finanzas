<!--
  Ahorros: bolsillos con aporte mensual y, si se quiere, compartidos con
  otras personas. Arriba la tabla, con lo justo por fila: nombre, aporte,
  meta y total. Cada ahorro se abre en dónde está el dinero y sus abonos y
  retiros; debajo, la gráfica de lo marcado: lo que ha tenido y cuánto habrá
  en N meses.
-->
<script lang="ts">
  import type { ChartConfiguration } from "chart.js";
  import { SvelteSet } from "svelte/reactivity";

  import Money from "../components/app/Money.svelte";
  import MovementForm from "../components/app/MovementForm.svelte";
  import SavingForm from "../components/app/SavingForm.svelte";
  import Chart from "../components/Chart.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Switch } from "../components/ui";
  import { addMonths, monthsToTarget, today } from "../lib/finance";
  import { dateShort, monthLabel, monthsLabel } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { colorOf } from "../lib/palettes";
  import { pb, session } from "../lib/pb.svelte";
  import { paidAt, savingsHistory, simChart, stateChart, valueAt } from "../lib/savingsCharts";
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


  // La gráfica muestra los ahorros encendidos en su leyenda (las fichas de
  // arriba, como en cualquier gráfica); al entrar, todos. Se guarda lo desmarcado para que un ahorro nuevo
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
  const listMonthly = $derived(list.reduce((a, s) => a + (s.monthly_amount || 0), 0));
  const listCurrent = $derived(list.reduce((a, s) => a + store.savingCurrent(s.id), 0));

  const current = (id: string) => store.savingCurrent(id);
  // La gráfica tiene dos vistas: lo que ha tenido cada ahorro (estado) y lo
  // que tendría si sigue aportando (simulación).
  let view = $state<"estado" | "sim">("estado");

  const history = $derived(savingsHistory(simulated, store.movements, ym));
  const nowTotal = $derived(simulated.reduce((a, s) => a + store.savingCurrent(s.id), 0));
  const grown = $derived(nowTotal - history.lines.reduce((a, l) => a + l.data[0], 0));

  const simMonthly = $derived(simulated.reduce((a, s) => a + (s.monthly_amount || 0), 0));
  const future = $derived(simulated.reduce((a, s) => a + valueAt(s, current(s.id), horizon), 0));
  const contributed = $derived(simulated.reduce((a, s) => a + paidAt(s, current(s.id), horizon), 0));

  // Las fichas ya dicen qué línea es cada ahorro: la leyenda de Chart.js
  // solo hace falta con uno solo en simulación (aportado e intereses).
  const chartConfig = (): ChartConfiguration =>
    view === "estado" ? stateChart(history, false) : simChart(simulated, current, horizon, ym, !multi);

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

  const accountName = (id: string) => store.account(id)?.name ?? (id ? "Otra cuenta" : "Sin cuenta");
  /** De otra persona: en una cuenta suya, o sin cuenta y anotado por ella. */
  const isForeign = (m: SavingMovement) => (m.account ? !store.account(m.account) : m.created_by !== session.id);
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
              <th>Ahorro</th>
              <th class="num">Al mes</th>
              <th class="sv-goal-col">Meta</th>
              <th class="num">Ahorrado</th>
              <th><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {#each list as s (s.id)}
              {@const current = store.savingCurrent(s.id)}
              {@const e = eta(s, current)}
              {@const holders = store.savingHolders(s.id)}
              {@const pct = s.target_amount ? Math.min(100, Math.max(0, (current / s.target_amount) * 100)) : 0}
              <tr class:sv-archived={s.archived}>
                <td class="sv-name">
                  <!-- Abre o cierra sus abonos y retiros, debajo de la fila. -->
                  <button type="button" class="sv-toggle" aria-expanded={opened.has(s.id)} aria-controls="sv-movs-{s.id}" onclick={() => toggleOpen(s.id)}>
                    <Icon name="arrow-right-01" size={14} class="sv-chevron" />
                    <span class="sv-ico" style:--c={colorOf(s.palette)}><Icon name={s.icon || "piggy-bank"} size={17} /></span>
                    <span class="sv-name-text">
                      <span class="sv-title">{s.name}</span>
                      <span class="sv-sub">
                        {movsCount(s.id)}{#if holders.length > 1}<span class="sv-dot">·</span>en {holders.length} lugares{/if}
                        {#if s.members?.length || s.owner !== session.id}<span class="sv-dot">·</span><span class="sv-shared"><Icon name="user-multiple" size={12} />Compartido</span>{/if}
                      </span>
                    </span>
                  </button>
                </td>
                <td class="num sv-cell">
                  {#if s.monthly_amount}<Money value={s.monthly_amount} />{:else}<span class="sv-none">—</span>{/if}
                  {#if s.annual_rate || s.auto}
                    <span class="sv-sub">{[s.annual_rate ? `${s.annual_rate}% anual` : "", s.auto ? "Automático" : ""].filter(Boolean).join(" · ")}</span>
                  {/if}
                </td>
                <td class="sv-goal-col sv-cell">
                  {#if s.target_amount}
                    <span class="sv-goal">
                      <span class="sv-goal-top"><b>{Math.round(pct)}%</b><span>de <Money value={s.target_amount} /></span></span>
                      <span class="bar-track"><span style:width="{pct}%" style:background={colorOf(s.palette)}></span></span>
                      <span class="sv-sub">
                        {#if e && e.months === 0}Objetivo alcanzado{:else if e}Llega en {monthLabel(e.month)}{:else}Sin aporte, sin fecha estimada{/if}
                      </span>
                    </span>
                  {:else}<span class="sv-none">Sin meta</span>{/if}
                </td>
                <td class="num sv-amount"><Money value={current} /></td>
                <td class="sv-actions">
                  <span>
                    <button type="button" class="btn-icon" aria-label="Registrar aporte o retiro en {s.name}" data-tip="Aporte o retiro" onclick={() => openMovement(s)}><Icon name="add-circle" size={17} /></button>
                    <button type="button" class="btn-icon" aria-label="Editar {s.name}" data-tip="Editar" onclick={() => ((editing = s), (formOpen = true))}><Icon name="edit-02" size={17} /></button>
                  </span>
                </td>
              </tr>
              {#if opened.has(s.id)}
                {@const movs = movsBySaving.get(s.id) ?? []}
                {@const holders = store.savingHolders(s.id)}
                <tr class="sv-detail" class:sv-archived={s.archived} id="sv-movs-{s.id}">
                  <td colspan="5">
                    {#if holders.length}
                      <!-- Dónde está, según sus movimientos: las cuentas propias y lo de cada persona en las suyas. -->
                      <div class="sv-where">
                        <span class="sv-where-label">Dónde está</span>
                        {#each holders as h (h.key)}
                          {#if h.person}
                            <span class="alloc-chip"><Icon name="user" size={11} />{store.personName(h.person)} <Money value={h.amount} /></span>
                          {:else}
                            <span class="alloc-chip"><i style:background={colorOf(store.account(h.account ?? "")?.palette)}></i>{accountName(h.account ?? "")} <Money value={h.amount} /></span>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                    {#if movs.length}
                      <table class="movs" aria-label="Aportes y retiros de {s.name}">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Movimiento</th>
                            <th>Cuenta</th>
                            <th class="num">Monto</th>
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
                                {#if isForeign(m)}
                                  <span class="alloc-chip"><Icon name="user" size={11} />{store.personName(m.created_by)}</span>
                                {:else}
                                  <span class="alloc-chip"><i style:background={colorOf(acc?.palette)}></i>{accountName(m.account)}</span>
                                {/if}
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
                                    aria-label="Eliminar"
                                    data-tip="Eliminar"
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
                        Todavía no hay aportes ni retiros.
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
              <td>{list.length} {list.length === 1 ? "ahorro" : "ahorros"}</td>
              <td class="num"><Money value={listMonthly} /></td>
              <td class="sv-goal-col"></td>
              <td class="num"><Money value={listCurrent} /></td>
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

    {#if list.length}
      <div class="card">
        <div class="card-head">
          <div>
            {#if !selected}
              <h3 class="card-title"><Icon name="chart-line-data-01" /> Gráfica</h3>
              <p class="card-sub">Elige abajo qué ahorros ver</p>
            {:else if multi}
              <h3 class="card-title"><Icon name="chart-line-data-01" /> {simulated.length} ahorros</h3>
              <p class="card-sub">{view === "estado" ? "Lo que han tenido mes a mes, y el total" : "Si siguen los aportes de cada uno"}</p>
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
        <!-- La leyenda: cada ficha muestra u oculta su ahorro en la gráfica. -->
        <div class="sv-legend" role="group" aria-label="Ahorros en la gráfica">
          {#each list as s (s.id)}
            <button type="button" class="sv-key" class:off={!selIds.has(s.id)} aria-pressed={selIds.has(s.id)} style:--c={colorOf(s.palette)} onclick={() => toggle(s)}>
              <i></i>{s.name}
            </button>
          {/each}
          {#if list.length > 1}
            <button type="button" class="link small sv-key-all" onclick={toggleAll}>{allOn ? "Ocultar todos" : "Ver todos"}</button>
          {/if}
        </div>
        {#if !selected}
          <div class="card-body"><p class="sv-legend-empty">Toca un ahorro de arriba para verlo en la gráfica.</p></div>
        {:else}
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
        {/if}
      </div>
    {/if}
  </div>
</div>

<SavingForm open={formOpen} saving={editing} onClose={() => (formOpen = false)} />
<MovementForm open={movOpen} saving={movSaving} movement={movEditing} onClose={() => (movOpen = false)} />

<style>
  /* En angosto la tabla se desliza de lado dentro de su tarjeta; lo que va
     en posición absoluta dentro se ancla aquí para no ensanchar la página. */
  .sv-table-wrap {
    position: relative;
    padding: 0;
    overflow-x: auto;
  }

  .sv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);

    & th {
      padding: var(--sp-10) var(--sp-16);
      border-bottom: var(--border-width) solid var(--border);
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: 600;
      text-align: left;
      white-space: nowrap;
    }

    & td {
      padding: var(--sp-16);
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
      padding: var(--sp-12) var(--sp-16);
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

  /* La leyenda de la gráfica: una ficha por ahorro, con el color de su línea.
     Apagada, se ve tenue y con el punto vacío. */
  .sv-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-14) var(--sp-24) 0;
  }

  .sv-key {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    padding: 0.3rem 0.7rem;
    border: 1px solid color-mix(in oklab, var(--c) 35%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--c) 10%, transparent);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    transition:
      opacity 0.15s,
      background 0.15s;

    & i {
      width: 0.6rem;
      height: 0.6rem;
      border: 2px solid var(--c);
      border-radius: 50%;
      background: var(--c);
    }

    &:hover {
      background: color-mix(in oklab, var(--c) 18%, transparent);
    }

    &.off {
      border-color: var(--border);
      background: transparent;
      color: var(--text-muted);
      font-weight: 500;

      & i {
        background: transparent;
      }
    }
  }

  .sv-key-all {
    margin-left: var(--sp-4);
  }

  .sv-legend-empty {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* La ficha lleva el color del ahorro: reemplaza el punto de color. */
  .sv-ico {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--c) 14%, transparent);
    color: var(--c);
  }

  .sv-dot {
    margin: 0 0.35em;
    opacity: 0.6;
  }

  .sv-shared {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    vertical-align: bottom;
  }

  /* Lo que no aplica, apagado para que no compita con los datos. */
  .sv-none {
    color: var(--text-subtle);
    font-size: var(--text-xs);
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
    margin-top: 0.15rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-weight: 400;
  }

  .sv-goal-col {
    min-width: 14rem;
  }

  /* Arriba el avance y la meta, en los extremos; la barra; y cuándo llega. */
  .sv-goal {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);

    & .bar-track {
      display: block;
    }
  }

  .sv-goal-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-8);

    & b {
      color: var(--text-primary);
      font-size: var(--text-sm);
    }
  }

  .sv-amount :global(.money) {
    font-size: 1.0625rem;
    font-weight: 700 !important;
  }

  /* Las acciones, discretas hasta pasar por la fila. */
  .sv-actions {
    width: 1%;

    & span {
      display: inline-flex;
      gap: 2px;
    }

    & .btn-icon {
      color: var(--text-muted);
      opacity: 0.7;
      transition: opacity 0.15s;
    }
  }

  .sv-table tbody tr:hover .sv-actions .btn-icon,
  .sv-actions .btn-icon:focus-visible {
    opacity: 1;
  }

  /* Dónde está el dinero del ahorro, en una línea encima de sus movimientos. */
  .sv-where {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8) var(--sp-16);
    padding: var(--sp-10) var(--sp-16);
    border-top: var(--border-width) solid var(--border);
  }

  .sv-where-label {
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
  }

  .alloc-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--text-xs);
    color: var(--text-secondary);

    & :global(.money) {
      color: var(--text-primary);
      font-weight: 600;
    }

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

  /* En sólido oscuro, lo que cuelga de la fila abierta va sin tinte: un
     fondo algo más negro que la tabla. */
  :global(:root[data-estilo="solido"][data-theme="dark"]) .sv-detail > td {
    background: color-mix(in oklab, black 22%, transparent);
  }

  .movs {
    width: 100%;
    border-collapse: collapse;

    & th {
      padding: var(--sp-8) var(--sp-16) !important;
      border-top: var(--border-width) solid var(--border);
      font-size: 0.6875rem;
    }

    & td {
      padding: var(--sp-8) var(--sp-16) !important;
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
    margin: 0 var(--sp-16) var(--sp-10);
  }

  .mov-empty {
    margin: 0;
    padding: var(--sp-10) var(--sp-16);
    border-top: var(--border-width) solid var(--border);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
