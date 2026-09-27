<!--
  La app del celular (`#/m`). Tiene las mismas secciones que la versión
  completa y en el mismo orden: abajo Resumen, Movimientos, Cuentas, Análisis
  y Más (Correos, Ahorros, Plan futuro y Ajustes). En Movimientos el mes se ve
  de cuatro maneras: diario, calendario, mensual (el año mes a mes) y total
  (presupuesto y cuentas). Lo que no tiene una versión propia del teléfono
  (Resumen, Correos, Ajustes, administrar cuentas) es la misma pantalla de
  escritorio, dentro de esta app.

  Funciona sin internet: lo anotado se guarda en el teléfono y se envía solo
  al volver la conexión (ver lib/offline.svelte.ts). Y si lo que anotaste a
  mano llega también desde el banco, pregunta si es el mismo movimiento.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import Icon from "../components/Icon.svelte";
  import Money from "../components/app/Money.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import TabBar from "../components/app/TabBar.svelte";
  import AccountsView from "../components/mobile/AccountsView.svelte";
  import BackButton from "../components/mobile/BackButton.svelte";
  import CalendarView from "../components/mobile/CalendarView.svelte";
  import DayList from "../components/mobile/DayList.svelte";
  import MonthlyView from "../components/mobile/MonthlyView.svelte";
  import MonthNav from "../components/mobile/MonthNav.svelte";
  import MonthSwipe from "../components/mobile/MonthSwipe.svelte";
  import PlanView from "../components/mobile/PlanView.svelte";
  import SavingsView from "../components/mobile/SavingsView.svelte";
  import SearchScreen from "../components/mobile/SearchScreen.svelte";
  import SlideIn from "../components/mobile/SlideIn.svelte";
  import StatsView from "../components/mobile/StatsView.svelte";
  import TopBar from "../components/mobile/TopBar.svelte";
  import TotalView from "../components/mobile/TotalView.svelte";
  import ModeToggle from "../components/ui/ModeToggle.svelte";
  import Accounts from "./Accounts.svelte";
  import Dashboard from "./Dashboard.svelte";
  import Inbox from "./Inbox.svelte";
  import Settings from "./Settings.svelte";
  import { monthRange, today, weekStart, ymd } from "../lib/finance";
  import { dateLong, dateShort, monthLabel } from "../lib/format";
  import { dupeSide } from "../lib/labels";
  import { emptyFilters, filterCount, filtersFrom, sumOf, type Tab } from "../lib/mobile";
  import { notify } from "../lib/notify.svelte";
  import { cachedList, offline } from "../lib/offline.svelte";
  import { overlay, type OutboxItem, type Pending } from "../lib/outbox";
  import { logout, pb, reauth, session } from "../lib/pb.svelte";
  import { store, touchTransactions } from "../lib/store.svelte";
  import { theme } from "../lib/theme.svelte";
  import type { Transaction } from "../lib/types";
  import { closeOnBack, goBack, nextDirection, route } from "../lib/router.svelte";
  import { transition } from "../lib/transition";
  import { syncSheet, txModal } from "../lib/ui.svelte";

  type Tx = Pending<Transaction>;
  type View = "diario" | "calendario" | "mensual" | "total";

  // Los mismos nombres e iconos que el menú de escritorio (ver App.svelte).
  const TABS = $derived<{ id: Tab; label: string; icon: string; count?: number }[]>([
    { id: "resumen", label: "Resumen", icon: "dashboard-square-01" },
    { id: "movimientos", label: "Movimientos", icon: "exchange-01" },
    { id: "cuentas", label: "Cuentas", icon: "wallet-01" },
    { id: "analisis", label: "Análisis", icon: "pie-chart" },
    { id: "mas", label: "Más", icon: "menu-01", count: store.inboxPending },
  ]);
  const VIEWS: { id: View; label: string }[] = [
    { id: "diario", label: "Diario" },
    { id: "calendario", label: "Calendario" },
    { id: "mensual", label: "Mensual" },
    { id: "total", label: "Total" },
  ];

  const thisMonth = today().slice(0, 7);
  let tab = $state<Tab>("resumen");
  let view = $state<View>("diario");
  let ym = $state(thisMonth);
  // Lo del buscador (ver mobile/SearchScreen.svelte): se conserva al volver.
  let filters = $state(emptyFilters());
  const searching = $derived(!!filters.text.trim() || filterCount(filters) > 0);

  let serverTxs = $state<Transaction[]>([]);
  let loading = $state(true);

  // Mensual trae el año; lo demás, las semanas completas que tocan el mes
  // (el calendario las muestra enteras).
  const range = $derived.by((): [string, string] => {
    if (view === "mensual") {
      const y = Number(ym.slice(0, 4));
      return [`${y}-01-01`, `${y + 1}-01-01`];
    }
    const [first, next] = monthRange(ym);
    const [y, m, d] = weekStart(next).split("-").map(Number);
    return [weekStart(first), ymd(new Date(y, m - 1, d + 7))];
  });

  // Lo guardado en el teléfono primero, lo del servidor después.
  $effect(() => {
    void store.txVersion;
    const [from, to] = range;
    let alive = true;
    loading = true;
    cachedList(
      `tx:${from}:${to}`,
      () =>
        pb.collection("transactions").getFullList<Transaction>({
          filter: pb.filter("date >= {:from} && date < {:to}", { from, to }),
          sort: "-date,-created",
          expand: "dup_of",
          batch: 1000,
        }),
      (list) => alive && (serverTxs = list),
    )
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  // Y encima, lo que falta por enviar.
  const txs = $derived.by(() => {
    const [from, to] = range;
    return overlay("transactions", serverTxs, offline.items, (t) => {
      const d = t.date.slice(0, 10);
      return d >= from && d < to;
    }).toSorted(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        String(b.created).localeCompare(String(a.created)),
    );
  });

  const monthTxs = $derived(txs.filter((t) => t.date.slice(0, 7) === ym));
  // Arriba: el año en Mensual, el mes en lo demás.
  const headTxs = $derived(view === "mensual" ? txs : monthTxs);
  const income = $derived(sumOf(headTxs, "income"));
  const expense = $derived(sumOf(headTxs, "expense"));

  /** Una cuenta de Cuentas: sus movimientos del mes, en el buscador y con la cuenta como filtro. */
  function openAccount(id: string) {
    filters = {
      ...emptyFilters(),
      accounts: [id],
      period: "month",
      ref: `${thisMonth}-01`,
    };
    location.hash = "#/m?ver=buscar";
  }

  // --- Un día del calendario --------------------------------------------
  let daySheet = $state("");
  const dayTxs = $derived(
    daySheet ? txs.filter((t) => t.date.slice(0, 10) === daySheet) : [],
  );

  // El botón de atrás del teléfono cierra las hojas.
  const dayOpen = $derived(!!daySheet);
  $effect(() => {
    if (dayOpen) return closeOnBack(() => (daySheet = ""));
  });
  $effect(() => {
    if (syncSheet.open) return closeOnBack(() => (syncSheet.open = false));
  });

  // --- Anotar: la pantalla de movimiento (ver mobile/TxScreen.svelte) ------
  function openSheet(type: "expense" | "income", day = today()) {
    daySheet = "";
    txModal.new({ type, date: day });
  }

  // --- Sin conexión: lo pendiente, en una hoja (la abre mobile/SyncButton) --
  // Con una hoja abierta la página de atrás se queda quieta.
  $effect(() => {
    if (!daySheet && !syncSheet.open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  });

  const OP_LABEL = {
    create: "Nuevo",
    update: "Cambio",
    delete: "Borrado",
  } as const;

  function describe(item: OutboxItem) {
    const d = { ...item.base, ...item.data } as Partial<Transaction>;
    const what =
      d.description ||
      store.category(d.category ?? "")?.name ||
      (d.type === "income" ? "ingreso" : "gasto");
    return {
      label: `${OP_LABEL[item.op]}: ${what}`,
      amount: Number(d.amount) || 0,
      type: d.type,
    };
  }

  // --- Posibles repetidos: lo anotado a mano contra lo del banco --------
  const dupes = $derived(monthTxs.filter((t) => t.dup_of));
  let merging = $state("");

  const twinOf = (t: Tx): Transaction | undefined =>
    t.expand?.dup_of ?? txs.find((x) => x.id === t.dup_of);

  /** El par ordenado: lo que anotó la persona y lo que trajo el banco. */
  function pairOf(t: Tx) {
    const twin = twinOf(t);
    if (!twin) return null;
    return t.source === "manual" || !t.source
      ? { mine: t, bank: twin }
      : { mine: twin, bank: t };
  }

  async function merge(t: Tx) {
    if (!offline.online)
      return notify.fail(new Error("Para unirlos hace falta conexión."));
    merging = t.id;
    try {
      // Si alguno tiene cambios sin enviar, primero esos.
      await offline.sync();
      if (offline.items.some((i) => i.id === t.id || i.id === t.dup_of)) {
        throw new Error(
          "Aún hay cambios de este movimiento sin enviar. Intenta en un momento.",
        );
      }
      await pb.send("/api/finanzas/tx/merge", {
        method: "POST",
        body: { id: t.id },
      });
      touchTransactions();
      notify.done("Listo: quedó uno solo");
    } catch (err) {
      notify.fail(err);
    } finally {
      merging = "";
    }
  }

  function distinct(t: Tx) {
    void offline.update("transactions", t.id, { dup_of: "" }, t);
  }

  // --- Qué vista abre la app --------------------------------------------
  function leave() {
    try {
      localStorage.setItem("finanzas-vista", "completa");
    } catch {}
  }

  $effect(() => {
    try {
      localStorage.setItem("finanzas-vista", "sencilla");
    } catch {}
  });

  // En el celular la letra va un 10 % más chica que en escritorio (ver `.m-app`).
  $effect(() => {
    const root = document.documentElement;
    root.classList.add("m-app");
    return () => root.classList.remove("m-app");
  });

  // Lo de "Más", como en el menú de escritorio.
  const MORE = $derived([
    { href: "#/m?ver=correos", label: "Correos", icon: "mail-01", hint: "Lo que llega del banco", count: store.inboxPending },
    { href: "#/m?ver=ahorros", label: "Ahorros", icon: "piggy-bank", hint: "Metas y aportes" },
    { href: "#/m?ver=plan", label: "Plan futuro", icon: "chart-line-data-01", hint: "Cómo irá tu dinero" },
    { href: "#/m?ver=ajustes", label: "Ajustes", icon: "settings-01", hint: "Categorías, Gmail y tu cuenta" },
  ]);

  // Las subpantallas se abren encima de su pestaña, en la misma ruta
  // (`#/m?ver=ahorros`): así el botón de atrás del teléfono vuelve a ella.
  const SUBS: Record<string, Tab> = {
    buscar: "movimientos",
    cuentas: "cuentas",
    correos: "mas",
    ahorros: "mas",
    plan: "mas",
    ajustes: "mas",
  };
  const sub = $derived.by(() => {
    const v = route.query.get("ver") ?? "";
    return v in SUBS ? v : null;
  });
  // El detalle de Análisis va en la ruta (`#/m?categoria=…`): así el botón de
  // atrás del teléfono sube un nivel. Con él abierto, la pestaña es Análisis.
  const drilled = $derived(route.query.has("categoria") || route.query.has("etiqueta"));
  /** Una pestaña pedida por la ruta (`#/m?pestana=analisis`), desde un enlace de escritorio. */
  const asked = $derived.by(() => {
    const p = route.query.get("pestana");
    return TABS.some((t) => t.id === p) ? (p as Tab) : null;
  });
  // Mientras está abierta se marca su pestaña; al cerrarla se vuelve a la
  // de antes (de una cuenta, a Cuentas).
  let tabBefore: Tab | null = null;
  $effect(() => {
    if (sub) {
      tabBefore ??= untrack(() => tab);
      tab = SUBS[sub];
    } else if (tabBefore) {
      tab = tabBefore;
      tabBefore = null;
    }
    if (drilled) tab = "analisis";
    if (asked) tab = asked;
  });
  // Un enlace de escritorio con filtros (`#/movimientos?cuenta=…`) llega al
  // buscador con ellos puestos.
  $effect(() => {
    if (sub !== "buscar") return;
    const f = filtersFrom(route.query);
    if (f) untrack(() => (filters = f));
  });
  /** Con qué nombre se vuelve de cada subpantalla. */
  const backLabel = $derived(TABS.find((t) => t.id === (sub ? SUBS[sub] : tab))?.label ?? "Volver");

  function pickTab(id: string) {
    const next = id as Tab;
    if (tab === next && !sub && !drilled && !asked) return;
    tabBefore = null;
    // Con una subpantalla abierta la anima el cambio de ruta.
    if (sub || drilled || asked) {
      tab = next;
      nextDirection("lado");
      location.replace("#/m");
    } else transition(() => (tab = next));
  }
  const closeSub = () => goBack("#/m");
</script>

<div class="m">
  {#if sub === "ahorros"}
    <SavingsView onBack={closeSub} />
  {:else if sub === "plan"}
    <PlanView onBack={closeSub} />
  {:else if sub === "buscar"}
    <SearchScreen bind:filters onBack={closeSub} />
  {:else if sub === "correos" || sub === "ajustes" || sub === "cuentas"}
    <TopBar>
      <BackButton label={backLabel} onclick={closeSub} />
    </TopBar>
    <div class="m-page">
      {#if sub === "correos"}<Inbox />{:else if sub === "ajustes"}<Settings />{:else}<Accounts />{/if}
    </div>
  {:else if tab === "resumen"}
    <TopBar brand />
    <div class="m-page"><Dashboard /></div>
  {:else if tab === "movimientos"}
    <TopBar>
      <MonthNav bind:ym yearly={view === "mensual"} />
      {#snippet actions()}
        <a
          href="#/m?ver=buscar"
          class="btn-icon sm m-search-btn"
          class:on={searching}
          aria-label={searching ? "Buscar (con filtros puestos)" : "Buscar"}
        >
          <Icon name="search-01" size={18} />
          {#if searching}<i class="m-dot"></i>{/if}
        </a>
      {/snippet}
    </TopBar>

    <div class="m-views">
      <Segmented bind:value={view} options={VIEWS} tabs full label="Vista" />
    </div>

    <MonthSwipe bind:ym step={view === "mensual" ? 12 : 1}>
      <div class="card m-sum">
        <div>
          <span class="m-sum-label"><span class="kpi-ico tone-income"><Icon name="money-receive-01" size={14} /></span>Ingresos</span>
          <Money value={income} tone="income" />
        </div>
        <div>
          <span class="m-sum-label"><span class="kpi-ico tone-expense"><Icon name="money-send-01" size={14} /></span>Gastos</span>
          <Money value={expense} tone="expense" />
        </div>
        <div>
          <span class="m-sum-label"><span class="kpi-ico"><Icon name="coins-01" size={14} /></span>Balance</span>
          <Money value={income - expense} />
        </div>
      </div>

      <SlideIn key={view} order={VIEWS.map((v) => v.id)}>
        {#if view === "diario"}
          {#each dupes as t (t.id)}
            {@const pair = pairOf(t)}
            {#if pair}
              <section class="card m-dupe" aria-label="Posible movimiento repetido">
                <div class="m-dupe-head">
                  <Icon name="copy-01" size={16} />
                  <strong>¿Es el mismo movimiento?</strong>
                  <Money value={t.amount} tone={t.type} />
                </div>
                <div class="m-dupe-pair">
                  <div>
                    <span class="m-label">{dupeSide(pair.mine)}</span>
                    <span class="m-desc"
                      >{pair.mine.description ||
                        store.category(pair.mine.category)?.name ||
                        "Sin descripción"}</span
                    >
                    <span class="m-sub"
                      >{dateShort(pair.mine.date.slice(0, 10))} · {store.account(
                        pair.mine.account,
                      )?.name ?? ""}</span
                    >
                  </div>
                  <div>
                    <span class="m-label">{dupeSide(pair.bank)}</span>
                    <span class="m-desc"
                      >{pair.bank.description || "Sin descripción"}</span
                    >
                    <span class="m-sub"
                      >{dateShort(pair.bank.date.slice(0, 10))} · {store.account(
                        pair.bank.account,
                      )?.name ?? ""}</span
                    >
                  </div>
                </div>
                <div class="m-dupe-foot">
                  <button type="button" class="btn sm" onclick={() => distinct(t)}
                    >Son distintos</button
                  >
                  <button
                    type="button"
                    class="btn sm btn-primary"
                    disabled={merging === t.id}
                    onclick={() => merge(t)}
                  >
                    <Icon name="git-merge" />{merging === t.id
                      ? "Uniendo…"
                      : "Es el mismo: unir"}
                  </button>
                </div>
              </section>
            {/if}
          {/each}
          <DayList
            txs={monthTxs}
            onOpen={(t) => txModal.edit(t)}
            empty={loading ? "" : `Sin movimientos en ${monthLabel(ym, true)}.`}
          />
        {:else if view === "calendario"}
          <CalendarView {ym} {txs} onPick={(d) => (daySheet = d)} />
        {:else if view === "mensual"}
          <MonthlyView
            {ym}
            {txs}
            onPick={(m) => {
              ym = m;
              view = "diario";
            }}
          />
        {:else}
          <TotalView {ym} txs={monthTxs} />
        {/if}
      </SlideIn>
    </MonthSwipe>
  {:else if tab === "analisis"}
    <StatsView onOpen={(t) => txModal.edit(t)} />
  {:else if tab === "cuentas"}
    <AccountsView onPick={openAccount} />
  {:else}
    <TopBar brand />
    <div class="m-page">
      <header class="page-head">
        <div>
          <h1>Más</h1>
          <p>Las demás secciones y tus preferencias.</p>
        </div>
      </header>

      <div class="card m-me">
        <span class="m-avatar"
          >{(session.user?.name || session.user?.email || "?")
            .slice(0, 1)
            .toUpperCase()}</span
        >
        <span class="m-txt">
          <span class="m-desc">{session.user?.name || "Tú"}</span>
          <span class="m-sub">{session.user?.email}</span>
        </span>
      </div>

      <ul class="card m-menu" aria-label="Secciones">
        {#each MORE as item (item.href)}
          <li>
            <a href={item.href}>
              <span class="m-menu-ic"><Icon name={item.icon} size={18} /></span>
              <span class="m-txt">
                <span class="m-desc">{item.label}</span>
                <span class="m-sub">{item.hint}</span>
              </span>
              {#if item.count}<span class="m-count">{item.count}</span>{/if}
              <Icon name="arrow-right-01" size={14} />
            </a>
          </li>
        {/each}
      </ul>

      <ul class="card m-menu" aria-label="Preferencias">
        <li class="m-menu-row">
          <span class="m-menu-ic"><Icon name="moon-02" size={18} /></span>
          <span class="m-desc">Modo oscuro</span>
          <ModeToggle
            dark={theme.name === "dark"}
            onToggle={(next) => theme.set(next)}
          />
        </li>
        <li>
          <a href="#/" onclick={leave}>
            <span class="m-menu-ic"><Icon name="computer" size={18} /></span>
            <span class="m-txt">
              <span class="m-desc">Versión completa</span>
              <span class="m-sub">La de escritorio, con el menú lateral</span>
            </span>
            <Icon name="arrow-right-01" size={14} />
          </a>
        </li>
      </ul>

      <button type="button" class="btn m-logout" onclick={logout}
        ><Icon name="logout-01" size={18} />Salir</button
      >
    </div>
  {/if}
</div>

{#if !sub && (tab === "resumen" || tab === "movimientos" || tab === "analisis")}
  <button
    type="button"
    class="m-fab"
    aria-label="Anotar"
    onclick={() => openSheet("expense")}
  >
    <Icon name="add-01" size={28} />
  </button>
{/if}

<TabBar items={TABS} active={tab} onPick={pickTab} />

{#if daySheet}
  <div class="m-veil" role="presentation" onclick={() => (daySheet = "")}></div>
  <div class="m-sheet flush" role="dialog" aria-label={dateLong(daySheet)}>
    <div class="m-sheet-head pad">
      <strong class="m-cap">{dateLong(daySheet)}</strong>
      <button
        type="button"
        class="btn-icon sm"
        aria-label="Cerrar"
        onclick={() => (daySheet = "")}
      >
        <Icon name="cancel-01" size={16} />
      </button>
    </div>
    <DayList
      flat
      txs={dayTxs}
      onOpen={(t) => {
        daySheet = "";
        txModal.edit(t);
      }}
      empty="Nada este día."
    />
    <div class="m-sheet-foot pad">
      <button
        type="button"
        class="m-btn in"
        onclick={() => openSheet("income", daySheet)}
        ><Icon name="add-01" size={18} />Ingreso</button
      >
      <button
        type="button"
        class="m-btn out"
        onclick={() => openSheet("expense", daySheet)}
        ><Icon name="remove-01" size={18} />Gasto</button
      >
    </div>
  </div>
{/if}

{#if syncSheet.open}
  <div
    class="m-veil"
    role="presentation"
    onclick={() => (syncSheet.open = false)}
  ></div>
  <div
    class="m-sheet"
    role="dialog"
    aria-label="Cambios guardados en el teléfono"
  >
    <div class="m-sheet-head">
      <strong>Cambios en el teléfono</strong>
      <button
        type="button"
        class="btn-icon sm"
        aria-label="Cerrar"
        onclick={() => (syncSheet.open = false)}
      >
        <Icon name="cancel-01" size={16} />
      </button>
    </div>

    {#if offline.authNeeded}
      <p class="m-note">
        Tu sesión venció. Entra de nuevo para enviar lo pendiente; no se pierde
        nada.
      </p>
      <button type="button" class="btn btn-primary" onclick={reauth}
        >Entrar de nuevo</button
      >
    {:else if !offline.online}
      <p class="m-note">
        Sin conexión. Lo que anotes queda guardado aquí y se envía solo cuando
        vuelva la señal.
      </p>
    {/if}

    {#if offline.pending}
      <div class="m-sheet-foot">
        <span
          >{offline.pending === 1
            ? "1 cambio por enviar"
            : `${offline.pending} cambios por enviar`}</span
        >
        <button
          type="button"
          class="btn sm"
          disabled={offline.syncing || !offline.online || offline.authNeeded}
          onclick={() => void offline.sync()}
        >
          <Icon name="refresh" />{offline.syncing
            ? "Enviando…"
            : "Enviar ahora"}
        </button>
      </div>
    {:else if !offline.failed.length}
      <p class="m-note">Todo está guardado en el servidor.</p>
    {/if}

    {#if offline.failed.length}
      <p class="m-note">
        El servidor no aceptó estos cambios. Puedes intentar otra vez o
        descartarlos.
      </p>
      <ul class="m-list">
        {#each offline.failed as item (item.seq)}
          {@const d = describe(item)}
          <li class="m-failed">
            <div class="m-txt">
              <span class="m-desc">{d.label}</span>
              <span class="m-sub">{item.error}</span>
            </div>
            <Money value={d.amount} tone={d.type} />
            <div class="m-failed-actions">
              <button
                type="button"
                class="btn sm"
                onclick={() => void offline.discard(item.seq!)}
                >Descartar</button
              >
              <button
                type="button"
                class="btn sm"
                disabled={!offline.online}
                onclick={() => void offline.retry(item.seq!)}
              >
                Reintentar
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  :global(html.m-app) {
    font-size: 99%; /* el 110 % de escritorio, menos un 10 % */
    /* La barra de abajo, del ancho de la columna de la app. */
    --tabbar-max: 40rem;
  }

  /* Toda la pantalla, sin márgenes: las listas van de borde a borde como en
     las apps del teléfono. En pantallas grandes se centra en una columna. */
  .m {
    max-width: 40rem;
    min-height: 100%;
    margin: 0 auto;
    padding-bottom: calc(4.75rem + env(safe-area-inset-bottom));
  }

  .btn-icon.on {
    color: var(--accent);
  }

  .m-search-btn {
    position: relative;
  }

  .m-dot {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    width: 0.5rem;
    height: 0.5rem;
    border: 2px solid var(--bg-level1);
    border-radius: 50%;
    background: var(--accent);
  }

  /* Las tarjetas de la app no desenfocan otra vez: ya lo hace el lienzo, y
     en el teléfono cada desenfoque cuesta. */
  .m :global(.card) {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .m-views {
    padding: var(--sp-12) var(--sp-12) var(--sp-4);
  }

  /* Lo que entró y salió, como las tarjetas del resumen: el icono en su
     círculo, la etiqueta y la cifra. */
  .m-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: var(--sp-8) var(--sp-12) var(--sp-12);
    padding: var(--sp-12) var(--sp-4);

    & > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sp-4);
      min-width: 0;
      overflow: hidden;
      padding: 0 var(--sp-6);
    }

    & > div + div {
      border-left: 1px solid var(--border);
    }

    & :global(.money) {
      max-width: 100%;
      overflow: hidden;
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
    }
  }

  .m-sum-label {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    font-size: var(--text-xs);
    color: var(--text-secondary);

    & .kpi-ico {
      width: 1.5rem;
      height: 1.5rem;
    }
  }

  .m-dupe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    margin: 0 var(--sp-12) var(--sp-12);
    padding: var(--sp-14, 0.875rem) var(--sp-16);
    border-color: color-mix(in oklch, var(--warning, var(--accent)) 45%, var(--glass-rim));
  }

  .m-dupe-head {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    font-size: var(--text-sm);

    & :global(.money) {
      margin-left: auto;
    }
  }

  .m-dupe-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-10);

    & > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
  }

  .m-dupe-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-8);
  }

  .m-label {
    display: block;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .m-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .m-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .m-failed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-6) var(--sp-10);
    padding: var(--sp-10) 0;
    border-bottom: 1px solid var(--border);

    & .m-sub {
      white-space: normal;
    }
  }

  .m-failed-actions {
    display: flex;
    grid-column: 1 / -1;
    justify-content: flex-end;
    gap: var(--sp-8);
  }

  .m-txt {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .m-desc,
  .m-sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .m-desc {
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .m-sub {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  /* --- Pantallas de la versión completa, dentro de la app ---
     El mismo margen que tiene la hoja de contenido de escritorio en una
     ventana angosta. Sus tarjetas no desenfocan otra vez: ya lo hace el
     lienzo. */
  .m-page {
    padding: var(--sp-16) var(--sp-16) var(--sp-24);

    & :global(.card) {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  /* --- Más --- */
  .m-me {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--sp-12);
    margin-bottom: var(--card-gap);
    padding: var(--sp-16) var(--sp-18, 1.125rem);
  }

  /* Como la del pie del menú lateral: una almohada con la inicial. */
  .m-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--bg-field);
    box-shadow: var(--pillow);
    color: var(--text-primary);
    font-weight: 700;
  }

  .m-menu {
    margin: 0 0 var(--card-gap);
    padding: var(--sp-6);
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }

    & a,
    & .m-menu-row {
      display: flex;
      align-items: center;
      gap: var(--sp-12);
      min-height: 3.5rem;
      padding: var(--sp-8) var(--sp-10);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      text-decoration: none;

      & > :global(i:last-child) {
        margin-left: auto;
        color: var(--text-muted);
      }
    }

    & a:active {
      background: var(--bg-hover);
    }

    & .m-menu-row > .m-desc {
      flex: 1;
    }
  }

  /* El icono en su círculo, como en las tarjetas del resumen. */
  .m-menu-ic {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--bg-field);
    box-shadow: var(--pillow);
    color: var(--text-secondary);
  }

  .m-count {
    min-width: 1.375rem;
    margin-left: auto;
    padding: 0 0.375rem;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.375rem;
    font-variant-numeric: tabular-nums;
    text-align: center;

    & + :global(i) {
      margin-left: 0 !important;
    }
  }

  .m-logout {
    width: 100%;
    min-height: 3rem;
    justify-content: center;
    color: var(--danger);
  }

  /* --- Abajo: el botón de anotar y las pestañas --- */
  .m-fab {
    position: fixed;
    right: max(var(--sp-16), calc(50vw - 20rem + var(--sp-16)));
    bottom: calc(5rem + env(safe-area-inset-bottom));
    z-index: 11;
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    box-shadow: 0 12px 24px -10px oklch(from var(--accent) l c h / 0.8);
    cursor: pointer;

    &:active {
      transform: scale(0.95);
    }
  }

  /* --- Hojas que suben desde abajo --- */
  .m-veil {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: oklch(0 0 0 / 0.35);
    -webkit-backdrop-filter: blur(6px) saturate(120%);
    backdrop-filter: blur(6px) saturate(120%);
    /* El toque que arrastra sobre el velo no mueve la página de atrás. */
    touch-action: none;
    animation: veil 0.2s ease-out;
  }

  :global([data-theme="dark"]) .m-veil {
    background: oklch(0 0 0 / 0.6);
  }

  @keyframes veil {
    from {
      opacity: 0;
    }
  }

  .m-sheet {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 41;
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    max-width: 40rem;
    max-height: 90dvh;
    margin: 0 auto;
    padding: var(--sp-16) var(--sp-16)
      calc(var(--sp-16) + env(safe-area-inset-bottom));
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    background: var(--glass-2, var(--bg-level2));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px))
      saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur, 16px))
      saturate(var(--glass-sat, 170%));
    box-shadow: var(--shadow-xl);
    overflow-y: auto;
    /* Al llegar al final de la hoja, el gesto no pasa a la página. */
    overscroll-behavior: contain;
    animation: up 0.2s ease-out;

    &.flush {
      gap: 0;
      padding: 0 0 env(safe-area-inset-bottom);
    }
  }

  /* En oscuro el lienzo y la hoja son casi del mismo gris: un filo claro
     arriba y una sombra más honda la separan de lo que tapa. */
  :global([data-theme="dark"]) .m-sheet {
    background: oklch(0.23 0 0 / 0.85);
    border-top: 1px solid oklch(1 0 0 / 0.14);
    box-shadow:
      0 -1px 0 oklch(1 0 0 / 0.04),
      0 -12px 40px oklch(0 0 0 / 0.6);
  }

  @keyframes up {
    from {
      translate: 0 100%;
    }
  }

  .m-sheet-head,
  .m-sheet-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-10);

    &.pad {
      padding: var(--sp-12) var(--sp-16);
    }
  }

  .m-sheet-head.pad {
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid var(--border);
    background: inherit;
  }

  .m-cap::first-letter {
    text-transform: uppercase;
  }

  .m-sheet-foot .m-btn {
    flex: 1;
  }

  .m-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
    min-height: 3rem;
    padding: 0 var(--sp-20);
    border: 0;
    border-radius: var(--radius-pill, 99px);
    font: inherit;
    font-weight: 600;
    color: #fff;
    cursor: pointer;

    &.out {
      background: var(--danger);
    }

    &.in {
      background: var(--success);
    }

    &:disabled {
      opacity: 0.6;
    }
  }
</style>
