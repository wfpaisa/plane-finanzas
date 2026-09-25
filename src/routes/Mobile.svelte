<!--
  La app del celular (`#/m`), ordenada como las apps de gastos de siempre:
  abajo cuatro pestañas —Movimientos, Estadísticas, Cuentas y Más— y en
  Movimientos el mes visto de cinco maneras: diario, calendario, mensual
  (el año mes a mes), total (presupuesto y cuentas) y por nota.

  Funciona sin internet: lo anotado se guarda en el teléfono y se envía solo
  al volver la conexión (ver lib/offline.svelte.ts). Y si lo que anotaste a
  mano llega también desde el banco, pregunta si es el mismo movimiento.
-->
<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import Money from "../components/app/Money.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import AccountsView from "../components/mobile/AccountsView.svelte";
  import CalendarView from "../components/mobile/CalendarView.svelte";
  import DayList from "../components/mobile/DayList.svelte";
  import MonthlyView from "../components/mobile/MonthlyView.svelte";
  import MonthNav from "../components/mobile/MonthNav.svelte";
  import NotesView from "../components/mobile/NotesView.svelte";
  import StatsView from "../components/mobile/StatsView.svelte";
  import TopBar from "../components/mobile/TopBar.svelte";
  import TotalView from "../components/mobile/TotalView.svelte";
  import ModeToggle from "../components/ui/ModeToggle.svelte";
  import { colorsFor } from "../lib/colors";
  import { monthRange, today, weekStart, ymd } from "../lib/finance";
  import { dateLong, dateShort, monthLabel, parseMoney, plainNumber } from "../lib/format";
  import { dupeSide } from "../lib/labels";
  import { matches, sumOf } from "../lib/mobile";
  import { categoryTags, hasTag } from "../lib/tags";
  import { notify } from "../lib/notify.svelte";
  import { cachedList, offline } from "../lib/offline.svelte";
  import { overlay, type OutboxItem, type Pending } from "../lib/outbox";
  import { colorOf } from "../lib/palettes";
  import { logout, pb, reauth, session } from "../lib/pb.svelte";
  import { store, touchTransactions } from "../lib/store.svelte";
  import { theme } from "../lib/theme.svelte";
  import type { Transaction } from "../lib/types";
  import { txModal } from "../lib/ui.svelte";

  type Tx = Pending<Transaction>;
  type Tab = "trans" | "stats" | "accounts" | "more";
  type View = "diario" | "calendario" | "mensual" | "total" | "nota";

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "trans", label: "Trans.", icon: "book-open-01" },
    { id: "stats", label: "Estad.", icon: "chart-column" },
    { id: "accounts", label: "Cuentas", icon: "wallet-01" },
    { id: "more", label: "Más", icon: "more-horizontal" },
  ];
  const VIEWS: { id: View; label: string }[] = [
    { id: "diario", label: "Diario" },
    { id: "calendario", label: "Calendario" },
    { id: "mensual", label: "Mensual" },
    { id: "total", label: "Total" },
    { id: "nota", label: "Nota" },
  ];

  const thisMonth = today().slice(0, 7);
  let tab = $state<Tab>("trans");
  let view = $state<View>("diario");
  let ym = $state(thisMonth);
  let accountFilter = $state("");
  let tagFilter = $state("");
  let search = $state("");
  let searchOpen = $state(false);

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
    }).toSorted((a, b) => b.date.localeCompare(a.date) || String(b.created).localeCompare(String(a.created)));
  });

  const shown = $derived(
    txs.filter(
      (t) =>
        (!accountFilter || t.account === accountFilter || t.to_account === accountFilter) &&
        (!tagFilter || hasTag(t, tagFilter)) &&
        matches(t, search),
    ),
  );
  // Las etiquetas para filtrar: las de las categorías y las que traen los movimientos.
  const tagOptions = $derived([...new Set([...categoryTags(), ...txs.flatMap((t) => t.tags ?? [])])].sort());
  const monthTxs = $derived(shown.filter((t) => t.date.slice(0, 7) === ym));
  // Arriba: el año en Mensual, el mes en lo demás.
  const headTxs = $derived(view === "mensual" ? shown : monthTxs);
  const income = $derived(sumOf(headTxs, "income"));
  const expense = $derived(sumOf(headTxs, "expense"));

  const catColor = (id: string) => colorsFor([store.category(id)?.color || "tint-10"])[0];

  function openAccount(id: string) {
    accountFilter = id;
    tab = "trans";
    view = "diario";
  }

  function findNote(text: string) {
    search = text;
    searchOpen = !!text;
    view = "diario";
  }

  // --- Un día del calendario --------------------------------------------
  let daySheet = $state("");
  const dayTxs = $derived(daySheet ? shown.filter((t) => t.date.slice(0, 10) === daySheet) : []);

  // --- Anotar rápido ---------------------------------------------------
  let sheet = $state<"expense" | "income" | null>(null);
  let amountText = $state("");
  let category = $state("");
  let account = $state("");
  let description = $state("");
  let date = $state(today());
  let busy = $state(false);
  let amountEl = $state<HTMLInputElement | null>(null);

  // Las categorías que más usas este mes van primero.
  const quickCats = $derived.by(() => {
    if (!sheet) return [];
    const uses = new Map<string, number>();
    for (const t of txs) if (t.category) uses.set(t.category, (uses.get(t.category) ?? 0) + 1);
    return store.categories
      .filter((c) => c.kind === sheet)
      .toSorted((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  });

  function openSheet(kind: "expense" | "income", day = today()) {
    daySheet = "";
    sheet = kind;
    amountText = "";
    category = "";
    description = "";
    date = day;
    account = accountFilter || store.activeAccounts[0]?.id || "";
    queueMicrotask(() => amountEl?.focus());
  }

  async function save() {
    const amount = parseMoney(amountText);
    if (!amount || amount <= 0) return notify.fail(new Error("Escribe la cantidad de dinero."));
    if (!account) return notify.fail(new Error("Elige la cuenta."));
    // Con la fecha borrada, hoy: el mes que se abre después es el mismo.
    const day = date || today();
    busy = true;
    try {
      await offline.create("transactions", {
        owner: session.id,
        type: sheet,
        amount,
        date: `${day} 12:00:00.000Z`,
        account,
        to_account: "",
        category,
        description: description.trim(),
        notes: "",
        tags: [],
        source: "manual",
      });
      notify.done(
        !offline.online
          ? "Guardado en el teléfono: se envía al volver la conexión"
          : sheet === "expense"
            ? "Gasto anotado"
            : "Ingreso anotado",
      );
      sheet = null;
      ym = day.slice(0, 7);
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  function moreOptions() {
    const type = sheet ?? "expense";
    sheet = null;
    txModal.new({ type, account, category: category || undefined });
  }

  // --- Sin conexión: el aviso y lo pendiente ----------------------------
  let syncSheet = $state(false);

  // Con una hoja abierta la página de atrás se queda quieta.
  $effect(() => {
    if (!sheet && !daySheet && !syncSheet) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  });

  // El teclado del teléfono tapa la parte de abajo sin mover lo fijo: la hoja
  // se sube lo que ocupa el teclado y se acorta al alto que queda a la vista.
  let kb = $state(0);
  let viewH = $state(0);
  $effect(() => {
    const vv = window.visualViewport;
    if (!sheet || !vv) return;
    const fit = () => {
      kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      viewH = Math.round(vv.height);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      kb = 0;
      viewH = 0;
    };
  });

  const status = $derived.by(() => {
    const n = offline.pending;
    if (offline.authNeeded && n) return { icon: "alert-02", text: "Entra de nuevo para enviar", tone: "warn" };
    if (offline.failed.length) {
      const f = offline.failed.length;
      return { icon: "alert-02", text: f === 1 ? "1 cambio sin guardar" : `${f} cambios sin guardar`, tone: "bad" };
    }
    if (!offline.online) return { icon: "wifi-off-01", text: n ? `Sin conexión · ${n} por enviar` : "Sin conexión", tone: "" };
    if (n) return { icon: "cloud-upload", text: `Enviando ${n}…`, tone: "" };
    return null;
  });

  const OP_LABEL = { create: "Nuevo", update: "Cambio", delete: "Borrado" } as const;

  function describe(item: OutboxItem) {
    const d = { ...item.base, ...item.data } as Partial<Transaction>;
    const what = d.description || store.category(d.category ?? "")?.name || (d.type === "income" ? "ingreso" : "gasto");
    return { label: `${OP_LABEL[item.op]}: ${what}`, amount: Number(d.amount) || 0, type: d.type };
  }

  // --- Posibles repetidos: lo anotado a mano contra lo del banco --------
  const dupes = $derived(monthTxs.filter((t) => t.dup_of));
  let merging = $state("");

  const twinOf = (t: Tx): Transaction | undefined => t.expand?.dup_of ?? txs.find((x) => x.id === t.dup_of);

  /** El par ordenado: lo que anotó la persona y lo que trajo el banco. */
  function pairOf(t: Tx) {
    const twin = twinOf(t);
    if (!twin) return null;
    return t.source === "manual" || !t.source ? { mine: t, bank: twin } : { mine: twin, bank: t };
  }

  async function merge(t: Tx) {
    if (!offline.online) return notify.fail(new Error("Para unirlos hace falta conexión."));
    merging = t.id;
    try {
      // Si alguno tiene cambios sin enviar, primero esos.
      await offline.sync();
      if (offline.items.some((i) => i.id === t.id || i.id === t.dup_of)) {
        throw new Error("Aún hay cambios de este movimiento sin enviar. Intenta en un momento.");
      }
      await pb.send("/api/finanzas/tx/merge", { method: "POST", body: { id: t.id } });
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

  const MORE = [
    { href: "#/ahorros", label: "Ahorros", icon: "piggy-bank" },
    { href: "#/proyeccion", label: "Plan futuro", icon: "chart-line-data-01" },
    { href: "#/importar", label: "Importar", icon: "mail-01" },
    { href: "#/ajustes", label: "Ajustes y categorías", icon: "settings-01" },
  ];
</script>

<div class="m">
  {#if tab === "trans"}
    <TopBar>
      <MonthNav bind:ym yearly={view === "mensual"} />
      {#snippet actions()}
        <button
          type="button"
          class="btn-icon sm"
          class:on={searchOpen || !!search || !!tagFilter}
          aria-label="Buscar"
          onclick={() => {
            searchOpen = !searchOpen;
            if (!searchOpen) {
              search = "";
              tagFilter = "";
            }
          }}
        >
          <Icon name="search-01" size={20} />
        </button>
      {/snippet}
    </TopBar>

    {#if searchOpen}
      <div class="m-search">
        <Icon name="search-01" size={16} />
        <!-- svelte-ignore a11y_autofocus -->
        <input type="search" placeholder="Buscar en {view === 'mensual' ? 'el año' : 'el mes'}…" bind:value={search} autofocus />
      </div>
      {#if tagOptions.length}
        <div class="m-tags" aria-label="Etiqueta">
          {#each tagOptions as t (t)}
            <button type="button" class="m-filter" class:on={tagFilter === t} aria-pressed={tagFilter === t} onclick={() => (tagFilter = tagFilter === t ? "" : t)}>
              #{t}
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <div class="m-views" role="tablist">
      {#each VIEWS as v (v.id)}
        <button type="button" role="tab" aria-selected={view === v.id} class:on={view === v.id} onclick={() => (view = v.id)}>
          {v.label}
        </button>
      {/each}
    </div>

    <div class="m-sum">
      <div><span>Ingresos</span><Money value={income} tone="income" /></div>
      <div><span>Gastos</span><Money value={expense} tone="expense" /></div>
      <div><span>Balance</span><Money value={income - expense} /></div>
    </div>

    {#if accountFilter || (tagFilter && !searchOpen)}
      <div class="m-filters">
        {#if accountFilter}
          <button type="button" class="m-filter" onclick={() => (accountFilter = "")}>
            {store.account(accountFilter)?.name}<Icon name="cancel-01" size={12} />
          </button>
        {/if}
        {#if tagFilter && !searchOpen}
          <button type="button" class="m-filter" onclick={() => (tagFilter = "")}>
            #{tagFilter}<Icon name="cancel-01" size={12} />
          </button>
        {/if}
      </div>
    {/if}

    {#if view === "diario"}
      {#each dupes as t (t.id)}
        {@const pair = pairOf(t)}
        {#if pair}
          <section class="m-dupe" aria-label="Posible movimiento repetido">
            <div class="m-dupe-head">
              <Icon name="copy-01" size={16} />
              <strong>¿Es el mismo movimiento?</strong>
              <Money value={t.amount} tone={t.type} />
            </div>
            <div class="m-dupe-pair">
              <div>
                <span class="m-label">{dupeSide(pair.mine)}</span>
                <span class="m-desc">{pair.mine.description || store.category(pair.mine.category)?.name || "Sin descripción"}</span>
                <span class="m-sub">{dateShort(pair.mine.date.slice(0, 10))} · {store.account(pair.mine.account)?.name ?? ""}</span>
              </div>
              <div>
                <span class="m-label">{dupeSide(pair.bank)}</span>
                <span class="m-desc">{pair.bank.description || "Sin descripción"}</span>
                <span class="m-sub">{dateShort(pair.bank.date.slice(0, 10))} · {store.account(pair.bank.account)?.name ?? ""}</span>
              </div>
            </div>
            <div class="m-dupe-foot">
              <button type="button" class="btn sm" onclick={() => distinct(t)}>Son distintos</button>
              <button type="button" class="btn sm btn-primary" disabled={merging === t.id} onclick={() => merge(t)}>
                <Icon name="git-merge" />{merging === t.id ? "Uniendo…" : "Es el mismo: unir"}
              </button>
            </div>
          </section>
        {/if}
      {/each}
      <DayList
        txs={monthTxs}
        onOpen={(t) => txModal.edit(t)}
        empty={loading ? "" : search || tagFilter ? `Nada con “${search || `#${tagFilter}`}” en ${monthLabel(ym, true)}.` : `Sin movimientos en ${monthLabel(ym, true)}.`}
      />
    {:else if view === "calendario"}
      <CalendarView {ym} txs={shown} onPick={(d) => (daySheet = d)} />
    {:else if view === "mensual"}
      <MonthlyView
        {ym}
        txs={shown}
        onPick={(m) => {
          ym = m;
          view = "diario";
        }}
      />
    {:else if view === "total"}
      <TotalView {ym} txs={monthTxs} />
    {:else}
      <NotesView txs={monthTxs} onPick={findNote} />
    {/if}
  {:else if tab === "stats"}
    <StatsView onOpen={(t) => txModal.edit(t)} />
  {:else if tab === "accounts"}
    <AccountsView onPick={openAccount} />
  {:else}
    <TopBar><span>Más</span></TopBar>
    <div class="m-me">
      <span class="m-avatar">{(session.user?.name || session.user?.email || "?").slice(0, 1).toUpperCase()}</span>
      <span class="m-txt">
        <span class="m-desc">{session.user?.name || "Tú"}</span>
        <span class="m-sub">{session.user?.email}</span>
      </span>
    </div>
    <ul class="m-menu">
      {#each MORE as item (item.href)}
        <li><a href={item.href}><Icon name={item.icon} size={20} />{item.label}<Icon name="arrow-right-01" size={16} /></a></li>
      {/each}
      <li>
        <button type="button" onclick={() => (syncSheet = true)}>
          <Icon name="cloud-upload" size={20} />Cambios en el teléfono
          {#if offline.pending || offline.failed.length}<span class="m-count">{offline.pending + offline.failed.length}</span>{/if}
          <Icon name="arrow-right-01" size={16} />
        </button>
      </li>
      <li class="m-menu-row">
        <span><Icon name="moon-02" size={20} />Modo oscuro</span>
        <ModeToggle dark={theme.name === "dark"} onToggle={(next) => theme.set(next)} />
      </li>
      <li><a href="#/" onclick={leave}><Icon name="dashboard-square-01" size={20} />Versión completa<Icon name="arrow-right-01" size={16} /></a></li>
      <li><button type="button" class="danger" onclick={logout}><Icon name="logout-01" size={20} />Salir</button></li>
    </ul>
  {/if}
</div>

{#if status}
  <button type="button" class="m-sync {status.tone}" onclick={() => (syncSheet = true)}>
    <Icon name={status.icon} size={16} />{status.text}
    <Icon name="arrow-right-01" size={14} />
  </button>
{/if}

{#if tab === "trans" || tab === "stats"}
  <button type="button" class="m-fab" aria-label="Anotar" onclick={() => openSheet("expense")}>
    <Icon name="add-01" size={28} />
  </button>
{/if}

<nav class="m-nav">
  {#each TABS as t (t.id)}
    <button type="button" class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined} onclick={() => (tab = t.id)}>
      <Icon name={t.icon} size={22} /><span>{t.label}</span>
    </button>
  {/each}
</nav>

{#if daySheet}
  <div class="m-veil" role="presentation" onclick={() => (daySheet = "")}></div>
  <div class="m-sheet flush" role="dialog" aria-label={dateLong(daySheet)}>
    <div class="m-sheet-head pad">
      <strong class="m-cap">{dateLong(daySheet)}</strong>
      <button type="button" class="btn-icon sm" aria-label="Cerrar" onclick={() => (daySheet = "")}>
        <Icon name="cancel-01" size={16} />
      </button>
    </div>
    <DayList
      txs={dayTxs}
      onOpen={(t) => {
        daySheet = "";
        txModal.edit(t);
      }}
      empty="Nada este día."
    />
    <div class="m-sheet-foot pad">
      <button type="button" class="m-btn in" onclick={() => openSheet("income", daySheet)}><Icon name="add-01" size={18} />Ingreso</button>
      <button type="button" class="m-btn out" onclick={() => openSheet("expense", daySheet)}><Icon name="remove-01" size={18} />Gasto</button>
    </div>
  </div>
{/if}

{#if syncSheet}
  <div class="m-veil" role="presentation" onclick={() => (syncSheet = false)}></div>
  <div class="m-sheet" role="dialog" aria-label="Cambios guardados en el teléfono">
    <div class="m-sheet-head">
      <strong>Cambios en el teléfono</strong>
      <button type="button" class="btn-icon sm" aria-label="Cerrar" onclick={() => (syncSheet = false)}>
        <Icon name="cancel-01" size={16} />
      </button>
    </div>

    {#if offline.authNeeded}
      <p class="m-note">Tu sesión venció. Entra de nuevo para enviar lo pendiente; no se pierde nada.</p>
      <button type="button" class="btn btn-primary" onclick={reauth}>Entrar de nuevo</button>
    {:else if !offline.online}
      <p class="m-note">Sin conexión. Lo que anotes queda guardado aquí y se envía solo cuando vuelva la señal.</p>
    {/if}

    {#if offline.pending}
      <div class="m-sheet-foot">
        <span>{offline.pending === 1 ? "1 cambio por enviar" : `${offline.pending} cambios por enviar`}</span>
        <button
          type="button"
          class="btn sm"
          disabled={offline.syncing || !offline.online || offline.authNeeded}
          onclick={() => void offline.sync()}
        >
          <Icon name="refresh" />{offline.syncing ? "Enviando…" : "Enviar ahora"}
        </button>
      </div>
    {:else if !offline.failed.length}
      <p class="m-note">Todo está guardado en el servidor.</p>
    {/if}

    {#if offline.failed.length}
      <p class="m-note">El servidor no aceptó estos cambios. Puedes intentar otra vez o descartarlos.</p>
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
              <button type="button" class="btn sm" onclick={() => void offline.discard(item.seq!)}>Descartar</button>
              <button type="button" class="btn sm" disabled={!offline.online} onclick={() => void offline.retry(item.seq!)}>
                Reintentar
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

{#if sheet}
  <div class="m-veil" role="presentation" onclick={() => (sheet = null)}></div>
  <form
    class="m-sheet m-quick"
    class:kb={kb > 0}
    style:--kb="{kb}px"
    style:--view-h={viewH ? `${viewH}px` : null}
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <div class="m-sheet-head">
      <Segmented
        value={sheet}
        options={[
          { id: "expense", label: "Gasto" },
          { id: "income", label: "Ingreso" },
        ]}
        onchange={(v) => {
          sheet = v;
          category = "";
        }}
        label="Tipo"
      />
      <button type="button" class="btn-icon sm" aria-label="Cerrar" onclick={() => (sheet = null)}>
        <Icon name="cancel-01" size={16} />
      </button>
    </div>

    <div class="m-quick-body">
    <label class="m-amount" class:out={sheet === "expense"}>
      <span>$</span>
      <input
        bind:this={amountEl}
        inputmode="numeric"
        placeholder="0"
        aria-label="Cantidad"
        value={amountText}
        oninput={(e) => {
          const n = parseMoney(e.currentTarget.value.replace(/\./g, ""));
          amountText = n ? plainNumber(n) : "";
          e.currentTarget.value = amountText;
        }}
      />
    </label>

    <div class="m-row2">
      <input class="field-control" placeholder="¿En qué? (opcional)" bind:value={description} />
      <input class="field-control" type="date" aria-label="Fecha" bind:value={date} />
    </div>

    <div class="m-chips" aria-label="Categoría">
      {#each quickCats as c (c.id)}
        <button
          type="button"
          class="m-chip"
          class:on={category === c.id}
          style:--c={catColor(c.id)}
          onclick={() => (category = category === c.id ? "" : c.id)}
        >
          <Icon name={c.icon || "tag-01"} />{c.name}
        </button>
      {/each}
    </div>

    <div class="m-chips" aria-label="Cuenta">
      {#each store.activeAccounts as a (a.id)}
        <button
          type="button"
          class="m-chip"
          class:on={account === a.id}
          style:--c={colorOf(a.palette)}
          onclick={() => (account = a.id)}
        >
          {a.name}
        </button>
      {/each}
    </div>
    </div>

    <div class="m-sheet-foot">
      <button type="button" class="btn" onclick={moreOptions}>Más opciones</button>
      <button type="submit" class="m-btn {sheet === 'expense' ? 'out' : 'in'}" disabled={busy}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </div>
  </form>
{/if}

<style>
  /* Toda la pantalla, sin márgenes: las listas van de borde a borde como en
     las apps del teléfono. En pantallas grandes se centra en una columna. */
  .m {
    max-width: 40rem;
    min-height: 100%;
    margin: 0 auto;
    padding-bottom: calc(4.25rem + env(safe-area-inset-bottom));
    background: var(--glass-0, transparent);
  }

  .btn-icon.on {
    color: var(--accent);
  }

  .m-search {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-8) var(--sp-16);
    border-bottom: 1px solid var(--border);
    color: var(--text-muted);

    & input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: none;
      font: inherit;
      color: var(--text-primary);
    }
  }

  .m-views {
    display: flex;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;

    & button {
      flex: 1 0 auto;
      padding: var(--sp-12) var(--sp-10);
      border: 0;
      border-bottom: 3px solid transparent;
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      color: var(--text-muted);
      cursor: pointer;

      &.on {
        border-bottom-color: var(--accent);
        color: var(--text-primary);
        font-weight: 600;
      }
    }
  }

  .m-sum {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: var(--sp-10) var(--sp-8);
    border-bottom: 1px solid var(--border);
    text-align: center;

    & div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    & span:first-child {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    & :global(.money) {
      font-size: var(--text-sm);
    }
  }

  .m-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    padding: var(--sp-8) var(--sp-16) 0;
  }

  .m-tags {
    display: flex;
    gap: var(--sp-6);
    padding: var(--sp-8) var(--sp-16);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .m-filter {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    padding: var(--sp-4) var(--sp-10);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-field);
    font: inherit;
    font-size: var(--text-xs);
    color: var(--text-primary);
    white-space: nowrap;
    cursor: pointer;

    &.on {
      border-color: var(--accent);
      background: color-mix(in oklch, var(--accent) 18%, var(--bg-field));
      font-weight: 600;
    }
  }

  .m-sync {
    position: fixed;
    left: var(--sp-16);
    right: 5.5rem;
    bottom: calc(4.75rem + env(safe-area-inset-bottom));
    z-index: 11;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    max-width: 24rem;
    padding: var(--sp-8) var(--sp-12);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 99px);
    background: var(--glass-2, var(--bg-field));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px));
    backdrop-filter: blur(var(--glass-blur, 16px));
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-md, none);

    & :global(i:last-child) {
      margin-left: auto;
    }

    &.warn {
      border-color: color-mix(in oklch, var(--warning, var(--danger)) 50%, var(--border));
      color: var(--text-primary);
    }

    &.bad {
      border-color: color-mix(in oklch, var(--danger) 50%, var(--border));
      color: var(--danger);
    }
  }

  .m-dupe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    margin: var(--sp-12) var(--sp-16) 0;
    padding: var(--sp-12) var(--sp-16);
    border: 1px solid color-mix(in oklch, var(--warning, var(--accent)) 45%, var(--border));
    border-radius: var(--radius-xl);
    background: var(--bg-field);
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

  /* --- Más --- */
  .m-me {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    padding: var(--sp-16);
    border-bottom: 0.5rem solid var(--bg-hover);
  }

  .m-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 700;
  }

  .m-menu {
    margin: 0;
    padding: 0;
    list-style: none;

    & a,
    & button,
    & .m-menu-row {
      display: flex;
      align-items: center;
      gap: var(--sp-12);
      width: 100%;
      padding: var(--sp-14, 0.875rem) var(--sp-16);
      border: 0;
      border-bottom: 1px solid var(--border);
      background: none;
      font: inherit;
      color: var(--text-primary);
      text-align: left;
      text-decoration: none;
      cursor: pointer;

      & > :global(i:last-child) {
        margin-left: auto;
        color: var(--text-muted);
      }
    }

    & .m-menu-row {
      justify-content: space-between;
      cursor: default;

      & span {
        display: flex;
        align-items: center;
        gap: var(--sp-12);
      }
    }

    & .danger {
      color: var(--danger);
    }
  }

  .m-count {
    padding: 0 var(--sp-6);
    border-radius: var(--radius-pill, 99px);
    background: var(--accent);
    font-size: var(--text-xs);
    color: var(--accent-text);
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

  .m-nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--sp-4) 0 calc(var(--sp-4) + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--glass-2, var(--bg-level1));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));

    & button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
      padding: var(--sp-6) var(--sp-4);
      border: 0;
      background: none;
      font: inherit;
      font-size: var(--text-xs);
      color: var(--text-muted);
      cursor: pointer;

      &.on {
        color: var(--accent);
        font-weight: 600;
      }
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
    padding: var(--sp-16) var(--sp-16) calc(var(--sp-16) + env(safe-area-inset-bottom));
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    background: var(--bg-level2, var(--bg-card));
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
    background: oklch(0.23 0 0);
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

  /* Anotar rápido: la cabeza y los botones siempre a la vista; lo del medio
     se desplaza si no cabe, por ejemplo con el teclado abierto. */
  .m-quick {
    bottom: var(--kb, 0px);
    max-height: calc(var(--view-h, 100dvh) * 0.9);
    overflow: hidden;

    /* Con el teclado abierto no hace falta dejar el hueco del borde inferior. */
    &.kb {
      max-height: calc(var(--view-h, 100dvh) - var(--sp-8));
      padding-bottom: var(--sp-12);
    }
  }

  .m-quick-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-12);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
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

  .m-amount {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--sp-4);
    font-family: var(--font-num);
    font-size: 2.5rem;
    font-weight: 600;
    color: var(--success);

    &.out {
      color: var(--danger);
    }

    & input {
      width: 100%;
      min-width: 0;
      max-width: 14ch;
      border: 0;
      outline: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: center;
    }
  }

  .m-row2 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-8);

    & input {
      min-width: 0;
    }
  }

  .m-chips {
    display: flex;
    gap: var(--sp-6);
    margin: 0 calc(-1 * var(--sp-16));
    padding: 0 var(--sp-16) var(--sp-4);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .m-chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-6);
    padding: var(--sp-8) var(--sp-12);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 99px);
    background: var(--bg-field);
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;

    & :global(i) {
      color: var(--c);
    }

    &.on {
      border-color: var(--c);
      background: color-mix(in oklch, var(--c) 20%, var(--bg-field));
      font-weight: 600;
    }
  }
</style>
