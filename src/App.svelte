<script lang="ts">
  import { untrack } from "svelte";

  import Icon from "./components/Icon.svelte";
  import Logo from "./components/Logo.svelte";
  import TransactionForm from "./components/app/TransactionForm.svelte";
  import TooltipLayer from "./components/TooltipLayer.svelte";
  import { ErrorNote, Loading, Modal, SuccessNote } from "./components/ui";
  import ModeToggle from "./components/ui/ModeToggle.svelte";
  import { notify } from "./lib/notify.svelte";
  import { logout, session } from "./lib/pb.svelte";
  import { go, route } from "./lib/router.svelte";
  import { start, stop, store } from "./lib/store.svelte";
  import { categoryTags } from "./lib/tags";
  import { theme } from "./lib/theme.svelte";
  import { keys, SHORTCUTS } from "./lib/keys";
  import { txModal } from "./lib/ui.svelte";
  import Accounts from "./routes/Accounts.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Import from "./routes/Import.svelte";
  import Login from "./routes/Login.svelte";
  import Mobile from "./routes/Mobile.svelte";
  import Plan from "./routes/Plan.svelte";
  import Reports from "./routes/Reports.svelte";
  import Savings from "./routes/Savings.svelte";
  import Settings from "./routes/Settings.svelte";
  import Transactions from "./routes/Transactions.svelte";

  const NAV = [
    { path: "/", label: "Resumen", icon: "dashboard-square-01", mobile: true },
    { path: "/movimientos", label: "Movimientos", icon: "exchange-01", mobile: true },
    { path: "/cuentas", label: "Cuentas", icon: "wallet-01", mobile: true },
    { path: "/estados", label: "Análisis", icon: "pie-chart", mobile: true },
    { path: "/ahorros", label: "Ahorros", icon: "piggy-bank", mobile: false },
    { path: "/proyeccion", label: "Plan futuro", icon: "chart-line-data-01", mobile: false },
    { path: "/importar", label: "Importar", icon: "mail-01", mobile: false },
    { path: "/ajustes", label: "Ajustes", icon: "settings-01", mobile: false },
  ];

  const PAGES = {
    "/": Dashboard,
    "/movimientos": Transactions,
    "/cuentas": Accounts,
    "/estados": Reports,
    "/ahorros": Savings,
    "/proyeccion": Plan,
    "/importar": Import,
    "/ajustes": Settings,
  } as Record<string, typeof Dashboard>;

  const Page = $derived(PAGES[route.path] ?? Dashboard);

  // En el teléfono la app abre en su vista (`#/m`), salvo que la persona haya
  // elegido la completa; y quien eligió la del teléfono vuelve a ella.
  try {
    const vista = localStorage.getItem("finanzas-vista");
    const phone = matchMedia("(max-width: 56rem)").matches;
    if (route.path === "/" && (vista === "sencilla" || (phone && vista !== "completa"))) go("/m");
  } catch {}

  // Entrar carga todo; salir lo suelta. Solo cuenta el id (refrescar la
  // sesión trae un objeto de usuario nuevo, y eso no es entrar de nuevo), y lo
  // que lean `start` y `stop` no se sigue.
  const uid = $derived(session.id);
  $effect(() => {
    if (uid) {
      untrack(() => void start());
      return () => untrack(() => void stop());
    }
  });

  let moreOpen = $state(false);

  // Atajos de toda la app; los de cada pantalla van en ella. Ver `lib/keys.ts`.
  let helpOpen = $state(false);
  const onKey = keys({
    n: () => session.user && route.path !== "/m" && txModal.new(),
    "?": () => session.user && (helpOpen = true),
    // 1 … 8: las pantallas en el orden del menú.
    ...Object.fromEntries(NAV.map((item, i) => [String(i + 1), () => session.user && route.path !== "/m" && go(item.path)])),
  });
  const knownTags = $derived([...new Set(["fijo", "revisar", "viaje", "trabajo", "casa", "salud", "regalo", ...categoryTags()])]);
</script>

{#if !session.user}
  <Login />
{:else if route.path === "/m"}
  {#if store.loaded}
    <Mobile />
  {:else}
    <Loading label="Cargando tus finanzas" />
  {/if}
{:else}
  <div class="shell">
    <aside class="sidebar">
      <a href="#/" class="brand"><span class="brand-mark"><Logo size={17} /></span>Finanzas</a>
      <nav class="nav">
        {#each NAV as item (item.path)}
          <a href="#{item.path}" class="nav-item" class:active={route.path === item.path}>
            <Icon name={item.icon} size={18} />{item.label}
          </a>
        {/each}
      </nav>
      <div class="sidebar-foot">
        <div class="me">
          <span class="avatar-letter">{(session.user.name || session.user.email).slice(0, 1).toUpperCase()}</span>
          <span class="me-name">{session.user.name || session.user.email}</span>
        </div>
        <div class="flex items-center gap-1">
          <ModeToggle dark={theme.name === "dark"} onToggle={(next) => theme.set(next)} />
          <button type="button" class="btn-icon sm" data-tip="Salir" aria-label="Salir" onclick={logout}>
            <Icon name="logout-01" size={16} />
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      {#if store.loaded}
        {#key route.path}
          <Page />
        {/key}
      {:else}
        <Loading label="Cargando tus finanzas" />
      {/if}
    </main>

    <button
      type="button"
      class="keys-fab"
      aria-label="Atajos de teclado"
      data-tip="Atajos de teclado (?)"
      data-tip-side="left"
      onclick={() => (helpOpen = true)}
    >
      <Icon name="keyboard" size={16} />
    </button>

    <button type="button" class="fab" aria-label="Agregar movimiento" data-tip="Agregar movimiento" data-tip-side="left" onclick={() => txModal.new()}>
      <Icon name="add-01" size={24} />
    </button>

    <nav class="bottom-nav">
      {#each NAV.filter((n) => n.mobile) as item (item.path)}
        <a href="#{item.path}" class:active={route.path === item.path}>
          <Icon name={item.icon} size={20} /><span>{item.label}</span>
        </a>
      {/each}
      <button type="button" class:active={!NAV.find((n) => n.path === route.path)?.mobile} onclick={() => (moreOpen = !moreOpen)}>
        <Icon name="menu-01" size={20} /><span>Más</span>
      </button>
      {#if moreOpen}
        <div class="more-sheet plane-card">
          {#each NAV.filter((n) => !n.mobile) as item (item.path)}
            <a href="#{item.path}" onclick={() => (moreOpen = false)}><Icon name={item.icon} size={18} />{item.label}</a>
          {/each}
          <a href="#/m" onclick={() => (moreOpen = false)}><Icon name="smart-phone-01" size={18} />Vista del teléfono</a>
          <div class="more-row">
            <ModeToggle dark={theme.name === "dark"} onToggle={(next) => theme.set(next)} />
            <button type="button" class="btn sm" onclick={logout}><Icon name="logout-01" />Salir</button>
          </div>
        </div>
      {/if}
    </nav>
  </div>
{/if}

<svelte:window onkeydown={onKey} />

<Modal open={helpOpen} onClose={() => (helpOpen = false)} title="Atajos de teclado" icon="keyboard">
  <div class="keys-help">
    {#each SHORTCUTS as group (group.where)}
      <section>
        <p class="eyebrow">{group.where}</p>
        <dl>
          {#each group.items as [key, what] (key)}
            <dt><kbd>{key}</kbd></dt>
            <dd>{what}</dd>
          {/each}
        </dl>
      </section>
    {/each}
    <p class="small muted">No funcionan mientras escribes en un campo.</p>
  </div>
</Modal>

{#if session.user}
  <TransactionForm open={txModal.open} tx={txModal.tx} preset={txModal.preset} onClose={() => txModal.close()} {knownTags} />
{/if}

<ErrorNote message={notify.error} />
<SuccessNote message={notify.ok} duration={3000} />
<TooltipLayer />

<style>
  .keys-help {
    display: grid;
    gap: var(--sp-16);

    & dl {
      display: grid;
      grid-template-columns: 5rem minmax(0, 1fr);
      gap: var(--sp-8) var(--sp-12);
      align-items: center;
      margin: var(--sp-6) 0 0;
    }

    & dd {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-primary);
    }

    & p {
      margin: 0;
    }
  }

  kbd {
    display: inline-block;
    min-width: 1.75rem;
    padding: 0.125rem var(--sp-6);
    border: 1px solid var(--border-strong);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm, 6px);
    background: var(--bg-field);
    font: inherit;
    font-family: var(--font-num, inherit);
    font-size: var(--text-xs);
    font-weight: 600;
    text-align: center;
    color: var(--text-primary);
  }

  /* El marco de las referencias: el menú y la hoja de contenido son dos
     paneles de vidrio que flotan sobre el lienzo, con aire alrededor. */
  .shell {
    display: grid;
    grid-template-columns: 15.5rem 1fr;
    gap: var(--sp-12);
    height: 100%;
    padding: var(--sp-12);

    @media (max-width: 56rem) {
      grid-template-columns: 1fr;
      padding: 0;
    }
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--sp-20);
    padding: var(--sp-20) var(--sp-14);
    border: 1px solid var(--glass-rim);
    border-radius: var(--radius-xl);
    background: var(--glass-sheen), var(--bg-sidebar);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    box-shadow:
      var(--glass-spec),
      var(--glass-shadow);
    overflow-y: auto;

    @media (max-width: 56rem) {
      display: none;
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: 0 var(--sp-6);
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    text-decoration: none;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    /* Igual que el ícono de la app: negro con brillo azul detrás de la F. */
    background:
      radial-gradient(circle at 50% 44%, oklch(0.52 0.25 265 / 0.6), transparent 70%),
      oklch(0.12 0.005 265);
    color: #fff;
    box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.12);
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  /* Los enlaces, sueltos: solo texto e icono. La pantalla actual va en una
     píldora blanca con la rayita de tinta a la izquierda, como en la
     referencia. */
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    position: relative;
    padding: 0.5625rem var(--sp-14);
    border-radius: var(--radius-pill);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    transition:
      background 0.2s,
      color 0.2s,
      box-shadow 0.2s;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.active {
      background: var(--bg-field);
      box-shadow: var(--pillow);
      color: var(--text-primary);
      font-weight: 600;

      &::before {
        content: "";
        position: absolute;
        left: 0.3125rem;
        top: 50%;
        width: 0.25rem;
        height: 1rem;
        translate: 0 -50%;
        border-radius: var(--radius-pill);
        background: var(--accent);
      }
    }
  }

  .sidebar-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    margin-top: auto;
    padding: var(--sp-10) var(--sp-6) 0;
    border-top: 1px solid var(--border);
  }

  .me {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
  }

  .avatar-letter {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--bg-field);
    box-shadow: var(--pillow);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .me-name {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* La hoja de contenido: el vidrio grande sobre el que se posan las
     tarjetas. Ella desenfoca el lienzo; lo de dentro ya no lo repite. */
  .main {
    min-width: 0;
    overflow-y: auto;
    padding: var(--sp-28) 2rem 6rem;
    border: 1px solid var(--glass-rim);
    border-radius: var(--radius-card);
    background: var(--glass-sheen), var(--glass-0);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    box-shadow:
      var(--glass-spec),
      var(--glass-shadow);

    @media (max-width: 56rem) {
      padding: var(--sp-16) var(--sp-16) 8rem;
      border: 0;
      border-radius: 0;
      background: transparent;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      box-shadow: none;
    }
  }

  .fab {
    position: fixed;
    right: 1.5rem;
    bottom: 1.5rem;
    z-index: 10;
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border: 0;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-text);
    box-shadow:
      inset 0 1px 0 oklch(1 0 0 / 0.16),
      0 14px 28px -12px oklch(from var(--accent) l c h / 0.8);
    cursor: pointer;
    transition:
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.2s;

    &:hover {
      transform: scale(1.08) rotate(90deg);
      box-shadow:
        inset 0 1px 0 oklch(1 0 0 / 0.16),
        0 18px 32px -12px oklch(from var(--accent) l c h / 0.85);
    }

    @media (max-width: 56rem) {
      bottom: 5.25rem;
      right: 1rem;
    }
  }

  /* Encima del botón de agregar y centrado con él. Solo donde hay teclado:
     en el teléfono y en lo táctil no tiene nada que explicar. */
  .keys-fab {
    position: fixed;
    right: calc(1.5rem + 0.625rem);
    bottom: calc(1.5rem + 3.5rem + 0.75rem);
    z-index: 10;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--border-float, var(--border));
    border-radius: 50%;
    background: var(--glass-sheen), var(--glass-2);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
    box-shadow: var(--glass-spec), var(--glass-shadow-float, var(--shadow-xl));
    color: var(--text-secondary, var(--text-primary));
    cursor: pointer;
    transition:
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      color 0.2s;

    &:hover {
      transform: scale(1.1);
      color: var(--text-primary);
    }

    @media (max-width: 56rem), (hover: none) {
      display: none;
    }
  }

  .bottom-nav {
    display: none;

    @media (max-width: 56rem) {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 10;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      padding: var(--sp-6) var(--sp-4) calc(var(--sp-6) + env(safe-area-inset-bottom));
      border-top: var(--border-width) solid var(--border);
      background: var(--glass-2);
      -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
      backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat, 170%));
      box-shadow: var(--glass-spec);

      & > a,
      & > button {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.125rem;
        padding: var(--sp-4);
        border: 0;
        background: none;
        font: inherit;
        font-size: 0.6875rem;
        color: var(--text-muted);
        text-decoration: none;
        cursor: pointer;

        &.active {
          color: var(--accent);
          font-weight: 600;
        }
      }
    }
  }

  .more-sheet {
    position: absolute;
    right: var(--sp-8);
    bottom: calc(100% + var(--sp-8));
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    padding: var(--sp-6);

    & a {
      display: flex;
      align-items: center;
      gap: var(--sp-10);
      padding: var(--sp-10);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      text-decoration: none;
      font-size: var(--text-sm);

      &:hover {
        background: var(--bg-hover);
      }
    }
  }

  .more-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--sp-8) var(--sp-6) var(--sp-4);
    border-top: var(--border-width) solid var(--border);
    margin-top: var(--sp-4);
  }
</style>
