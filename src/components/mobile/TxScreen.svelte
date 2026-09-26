<!--
  Anotar o editar un movimiento en el celular, a pantalla completa y como en
  las apps de gastos de siempre: arriba el tipo, luego una fila por dato y,
  al tocar una fila, su panel abajo —la cuadrícula de cuentas, la de
  categorías o un teclado de números— en vez del teclado del teléfono.

  Al anotar, cada elección pasa sola a la siguiente: cuenta → categoría →
  importe → nota. "Continuar" guarda y deja la pantalla lista para otro con
  la misma fecha y cuenta.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import type { TxType } from "../../lib/finance";
  import { today } from "../../lib/finance";
  import { colorsFor } from "../../lib/colors";
  import { money, plainNumber } from "../../lib/format";
  import { SOURCE_LABEL, TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { offline } from "../../lib/offline.svelte";
  import { colorOf } from "../../lib/palettes";
  import { pb, session } from "../../lib/pb.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";
  import type { TxPreset } from "../../lib/ui.svelte";
  import Icon from "../Icon.svelte";
  import Segmented from "../app/Segmented.svelte";
  import { ConfirmDialog } from "../ui";

  let {
    open,
    tx = null,
    preset,
    onClose,
  }: {
    open: boolean;
    tx?: Transaction | null;
    preset?: TxPreset;
    onClose: () => void;
  } = $props();

  type Panel = "account" | "to" | "category" | "amount" | null;

  const TITLE: Record<TxType, string> = { income: "Ingreso", expense: "Gasto", transfer: "Transferencia" };
  const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  /** El que se edita; al copiarlo queda en null y se guarda como nuevo. */
  let editing = $state<Transaction | null>(null);
  let type = $state<TxType>("expense");
  let date = $state(today());
  let account = $state("");
  let toAccount = $state("");
  let category = $state("");
  /** Lo que se escribe en el teclado: "12000" o una cuenta como "12000+3500". */
  let expr = $state("");
  let description = $state("");
  let notes = $state("");
  let tags = $state<string[]>([]);
  let files = $state<File[]>([]);
  let panel = $state<Panel>(null);
  let busy = $state(false);
  let confirmDelete = $state(false);
  let showRaw = $state(false);
  let noteEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!open) return;
    void tx;
    untrack(() => {
      editing = tx;
      type = tx?.type ?? preset?.type ?? "expense";
      date = tx ? tx.date.slice(0, 10) : (preset?.date ?? today());
      account = tx?.account ?? (preset?.account || store.activeAccounts[0]?.id || "");
      toAccount = tx?.to_account ?? "";
      category = tx?.category ?? preset?.category ?? "";
      expr = tx ? String(Math.round(tx.amount)) : "";
      description = tx?.description ?? "";
      notes = tx?.notes ?? "";
      tags = [...(tx?.tags ?? [])];
      files = [];
      showRaw = false;
      // Al anotar se empieza por la cuenta, ya elegida: un toque la confirma.
      panel = tx ? null : "account";
    });
  });

  // Con la pantalla abierta, la de atrás no se mueve.
  $effect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  });

  // El botón "atrás" del teléfono cierra primero el panel y luego la pantalla.
  $effect(() => {
    if (!open) return;
    // Una marca propia: una entrada que quedó de antes (tras recargar) no cuenta.
    const mark = Date.now();
    history.pushState({ txScreen: mark }, "");
    const onPop = () => {
      if (panel) {
        panel = null;
        history.pushState({ txScreen: mark }, "");
      } else onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.txScreen === mark) history.back();
    };
  });

  let bodyEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!panel || !bodyEl) return;
    queueMicrotask(() => bodyEl?.querySelector(".ts-row.focus")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  });

  const cats = $derived(
    store.categories
      .filter((c) => c.kind === (type === "income" ? "income" : "expense"))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  );

  $effect(() => {
    if (category && !cats.some((c) => c.id === category)) category = "";
  });

  // --- El importe ---------------------------------------------------------
  const terms = $derived(expr.match(/[+−]?\d+/g) ?? []);
  const amount = $derived(Math.max(0, terms.reduce((sum, t) => sum + (t[0] === "−" ? -1 : 1) * Number(t.replace(/[+−]/, "")), 0)));
  /** Hay una cuenta a medias ("12000+") o completa ("12000+3500"). */
  const hasOps = $derived(/[+−]/.test(expr));
  const hasSum = $derived(/\d[+−]\d/.test(expr));
  /** "12.000 + 3.500", con los números en miles. */
  const exprLabel = $derived(expr.replace(/\d+/g, (d) => plainNumber(Number(d))).replace(/([+−])/g, " $1 "));

  function press(key: string) {
    if (key === "back") return void (expr = expr.slice(0, -1));
    if (key === "+" || key === "−") {
      // Un signo al final se cambia por el nuevo; al comienzo no va ninguno.
      if (!expr) return;
      expr = /[+−]$/.test(expr) ? expr.slice(0, -1) + key : expr + key;
      return;
    }
    // Sin ceros a la izquierda en cada número.
    const last = expr.match(/\d*$/)?.[0] ?? "";
    if (!last && key.startsWith("0")) return;
    if (last.length + key.length > 12) return;
    expr += key;
  }

  function amountDone() {
    // Con una suma, "=" la resuelve y deja seguir escribiendo.
    if (hasSum) return void (expr = amount ? String(amount) : "");
    expr = amount ? String(amount) : "";
    if (editing) return void (panel = null);
    panel = null;
    queueMicrotask(() => noteEl?.focus());
  }

  // --- Elegir y seguir -------------------------------------------------------
  function next(from: Panel) {
    if (editing) return void (panel = null);
    const order: Panel[] = type === "transfer" ? ["account", "to", "amount"] : ["account", "category", "amount"];
    const i = order.indexOf(from);
    panel = order[i + 1] ?? null;
  }

  function pickAccount(id: string) {
    if (panel === "to") {
      toAccount = id;
      next("to");
    } else {
      account = id;
      if (toAccount === id) toAccount = "";
      next("account");
    }
  }

  function pickCategory(id: string) {
    category = id;
    next("category");
  }

  function setType(t: TxType) {
    type = t;
    if (!editing && panel === "category" && t === "transfer") panel = "to";
    if (!editing && panel === "to" && t !== "transfer") panel = "category";
  }

  function swap() {
    [account, toAccount] = [toAccount, account];
  }

  const dateLabel = $derived.by(() => {
    const [y, m, d] = date.split("-").map(Number);
    if (!y) return "Hoy";
    return `${d}/${m}/${y} (${DAYS[new Date(y, m - 1, d).getDay()]})`;
  });

  const accountName = (id: string) => store.account(id)?.name ?? "";
  const catColor = (id: string) => colorsFor([store.category(id)?.color || "tint-10"])[0];

  // --- Guardar ---------------------------------------------------------------
  async function save(again = false) {
    if (!amount) {
      panel = "amount";
      return notify.fail(new Error("Escribe la cantidad de dinero."));
    }
    if (!account) {
      panel = "account";
      return notify.fail(new Error("Elige la cuenta."));
    }
    if (type === "transfer" && (!toAccount || toAccount === account)) {
      panel = "to";
      return notify.fail(new Error("Elige una cuenta de destino distinta."));
    }
    busy = true;
    try {
      const data: Record<string, unknown> = {
        owner: session.id,
        type,
        amount,
        date: `${date || today()} 12:00:00.000Z`,
        account,
        to_account: type === "transfer" ? toAccount : "",
        category: type === "transfer" ? "" : category,
        description: description.trim(),
        notes,
        tags,
      };
      if (files.length) {
        // Las fotos van directo al servidor: necesitan conexión.
        data["attachments+"] = files;
        if (editing) await pb.collection("transactions").update(editing.id, data);
        else await pb.collection("transactions").create({ ...data, source: "manual" });
        touchTransactions();
      } else if (editing) {
        await offline.update("transactions", editing.id, data, editing);
      } else {
        await offline.create("transactions", { ...data, source: "manual" });
      }
      notify.done(
        !offline.online
          ? "Guardado en el teléfono: se envía al volver la conexión"
          : editing
            ? "Guardado"
            : `${TITLE[type]} anotado`,
      );
      if (!again) return onClose();
      // Otro con la misma fecha, tipo y cuenta.
      category = "";
      toAccount = "";
      expr = "";
      description = "";
      notes = "";
      tags = [];
      files = [];
      panel = type === "transfer" ? "to" : "category";
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  function copy() {
    editing = null;
    date = today();
    files = [];
    panel = null;
    notify.done("Copia lista: revisa y guarda");
  }

  async function remove() {
    if (!editing) return;
    busy = true;
    try {
      await offline.remove("transactions", editing.id, editing);
      confirmDelete = false;
      notify.done("Movimiento borrado");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  const KEYS = ["1", "2", "3", "back", "4", "5", "6", "−", "7", "8", "9", "+", "00", "0", "000"];
</script>

{#if open}
  <div class="ts" data-type={type} role="dialog" aria-modal="true" aria-label={TITLE[type]}>
    <header class="ts-top">
      <button type="button" class="btn-icon" aria-label="Volver" onclick={onClose}>
        <Icon name="arrow-left-01" size={22} />
      </button>
      <strong>{editing ? `Editar ${TITLE[type].toLowerCase()}` : TITLE[type]}</strong>
    </header>

    <div class="ts-body" class:padded={!!panel} bind:this={bodyEl} lang="es">
      <div class="ts-types">
        <Segmented value={type} options={TX_TYPES} full label="Tipo" onchange={setType} />
      </div>

      <div class="ts-rows">
        <label class="ts-row">
          <span class="ts-label">Fecha</span>
          <span class="ts-value">{dateLabel}</span>
          <input class="ts-date" type="date" aria-label="Fecha" bind:value={date} onfocus={() => (panel = null)} />
        </label>

        <div class="ts-row" class:focus={panel === "account"}>
          <span class="ts-label">{type === "transfer" ? "De" : "Cuenta"}</span>
          <button type="button" class="ts-value" onclick={() => (panel = "account")}>
            {#if account}<i class="ts-dot" style:--c={colorOf(store.account(account)?.palette)}></i>{accountName(account)}{/if}
          </button>
        </div>

        {#if type === "transfer"}
          <div class="ts-row" class:focus={panel === "to"}>
            <span class="ts-label">A</span>
            <button type="button" class="ts-value" onclick={() => (panel = "to")}>
              {#if toAccount}<i class="ts-dot" style:--c={colorOf(store.account(toAccount)?.palette)}></i>{accountName(toAccount)}{/if}
            </button>
            <button type="button" class="btn-icon sm ts-swap" aria-label="Intercambiar cuentas" onclick={swap}>
              <Icon name="arrow-up-01" size={14} /><Icon name="arrow-down-01" size={14} />
            </button>
          </div>
        {:else}
          <div class="ts-row" class:focus={panel === "category"}>
            <span class="ts-label">Categoría</span>
            <button type="button" class="ts-value" onclick={() => (panel = "category")}>
              {#if category}
                <Icon name={store.category(category)?.icon || "tag-01"} color={catColor(category)} />{store.category(category)?.name}
              {/if}
            </button>
          </div>
        {/if}

        <div class="ts-row" class:focus={panel === "amount"}>
          <span class="ts-label">Importe</span>
          <button type="button" class="ts-value ts-amount" onclick={() => (panel = "amount")}>
            {#if hasOps}
              <span class="ts-expr">{exprLabel}</span>{#if hasSum}<span>= {money(amount)}</span>{/if}
            {:else if expr}
              {money(amount)}
            {/if}
          </button>
        </div>

        <label class="ts-row">
          <span class="ts-label">Nota</span>
          <input
            bind:this={noteEl}
            class="ts-value ts-input"
            bind:value={description}
            enterkeyhint="done"
            onfocus={() => (panel = null)}
            onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
      </div>

      <div class="ts-extra">
        <div class="ts-notes">
          <textarea placeholder="Descripción" rows="1" bind:value={notes} onfocus={() => (panel = null)}></textarea>
          <label class="btn-icon ts-photo" aria-label="Agregar foto o recibo">
            <Icon name="camera-01" size={22} />
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onchange={(e) => {
                files = [...files, ...(e.currentTarget.files ?? [])];
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {#if files.length || editing?.attachments?.length}
          <div class="ts-files">
            {#each editing?.attachments ?? [] as f (f)}
              <span class="ts-file"><Icon name="attachment-01" />{f.replace(/_[a-z0-9]{10}(\.[^.]+)$/i, "$1")}</span>
            {/each}
            {#each files as f, i (i)}
              <span class="ts-file new">
                <Icon name="file-attachment" />{f.name}
                <button type="button" aria-label="Quitar" onclick={() => (files = files.filter((_, j) => j !== i))}>
                  <Icon name="cancel-01" size={12} />
                </button>
              </span>
            {/each}
          </div>
        {/if}
        {#if editing && editing.source && editing.source !== "manual"}
          <p class="ts-origin">
            Llegó por {SOURCE_LABEL[editing.source] ?? editing.source}
            {#if editing.raw}
              · <button type="button" class="link" onclick={() => (showRaw = !showRaw)}>{showRaw ? "Ocultar" : "Ver"} el texto</button>
            {/if}
          </p>
          {#if showRaw}<pre class="ts-raw">{editing.raw}</pre>{/if}
        {/if}
      </div>

      <div class="ts-actions">
        {#if editing}
          <button type="button" class="ts-btn" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Eliminar</button>
          <button type="button" class="ts-btn" onclick={copy}><Icon name="copy-01" />Copiar</button>
          <button type="button" class="ts-btn main" disabled={busy} onclick={() => save()}>{busy ? "Guardando…" : "Guardar"}</button>
        {:else}
          <button type="button" class="ts-btn main wide" disabled={busy} onclick={() => save()}>{busy ? "Guardando…" : "Guardar"}</button>
          <button type="button" class="ts-btn" disabled={busy} onclick={() => save(true)}>Continuar</button>
        {/if}
      </div>
    </div>

    {#if panel}
      <section class="ts-panel" aria-label={panel === "amount" ? "Importe" : panel === "category" ? "Categoría" : "Cuentas"}>
        <div class="ts-panel-head">
          <strong>{panel === "amount" ? "Importe" : panel === "category" ? "Categoría" : panel === "to" ? "Hacia la cuenta" : "Cuentas"}</strong>
          <button type="button" class="btn-icon sm" aria-label="Cerrar" onclick={() => (panel = null)}>
            <Icon name="cancel-01" size={18} />
          </button>
        </div>

        {#if panel === "account" || panel === "to"}
          <div class="ts-grid">
            {#each store.activeAccounts.filter((a) => panel === "account" || a.id !== account) as a (a.id)}
              {@const on = (panel === "to" ? toAccount : account) === a.id}
              <button type="button" class:on style:--c={colorOf(a.palette)} onclick={() => pickAccount(a.id)}>
                <i class="ts-dot"></i>{a.name}
              </button>
            {/each}
          </div>
        {:else if panel === "category"}
          <div class="ts-grid">
            {#each cats as c (c.id)}
              <button type="button" class:on={category === c.id} style:--c={catColor(c.id)} onclick={() => pickCategory(c.id)}>
                <Icon name={c.icon || "tag-01"} size={20} />{c.name}
              </button>
            {/each}
            <button type="button" class="none" class:on={!category} onclick={() => pickCategory("")}>Sin categoría</button>
          </div>
        {:else}
          <div class="ts-keys">
            {#each KEYS as k (k)}
              <button type="button" aria-label={k === "back" ? "Borrar" : k === "−" ? "Restar" : k === "+" ? "Sumar" : undefined} onclick={() => press(k)}>
                {k === "back" ? "⌫" : k}
              </button>
            {/each}
            <button type="button" class="done" onclick={amountDone}>{hasSum ? "=" : "Listo"}</button>
          </div>
        {/if}
      </section>
    {/if}
  </div>

  <ConfirmDialog
    open={confirmDelete}
    onClose={() => (confirmDelete = false)}
    title="Eliminar movimiento"
    message="Se borra con sus adjuntos. No se puede deshacer."
    {busy}
    onConfirm={remove}
  />
{/if}

<style>
  .ts {
    --tone: var(--danger);
    position: fixed;
    inset: 0;
    z-index: 45;
    display: flex;
    flex-direction: column;
    max-width: 40rem;
    margin: 0 auto;
    overflow: hidden;
    background: var(--bg-level1, var(--bg-card));
    font-size: var(--text-sm);
    animation: in 0.18s ease-out;

    &[data-type="income"] {
      --tone: var(--success);
    }

    &[data-type="transfer"] {
      --tone: var(--transfer);
    }
  }

  @keyframes in {
    from {
      opacity: 0;
      translate: 0 1.5rem;
    }
  }

  .ts-top {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-height: 3rem;
    padding: calc(var(--sp-4) + env(safe-area-inset-top)) var(--sp-12) var(--sp-4) var(--sp-6);
    font-size: var(--text-base, 1rem);
  }

  .ts-body {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: calc(var(--sp-16) + env(safe-area-inset-bottom));

    /* Con un panel abierto, lo de arriba se puede subir hasta dejarlo a la vista. */
    &.padded {
      padding-bottom: 50dvh;
    }
  }

  /* --- El tipo: el mismo selector de escritorio --- */
  .ts-types {
    padding: 0 var(--sp-16) var(--sp-8);
  }

  /* --- Las filas --- */
  .ts-rows {
    padding: 0 var(--sp-16);
  }

  .ts-row {
    position: relative;
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    align-items: center;
    min-height: 2.75rem;
    /* Al abrir su panel, la fila sube hasta quedar por encima de él. */
    scroll-margin-bottom: 56dvh;
    cursor: pointer;
  }

  .ts-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .ts-value {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    align-self: stretch;
    min-width: 0;
    padding: 0 var(--sp-4);
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .ts-row:has(.ts-swap) .ts-value,
  .ts-row:has(.ts-date) .ts-value {
    grid-column: 2 / -1;
  }

  .ts-row.focus .ts-value,
  .ts-row:focus-within .ts-value {
    border-bottom: 2px solid var(--tone);
  }

  .ts-input {
    grid-column: 2 / -1;
    outline: 0;
    cursor: text;
  }

  /* El selector de fecha del teléfono, invisible encima de la fila. */
  .ts-date {
    position: absolute;
    inset: 0 0 0 5rem;
    opacity: 0;
    cursor: pointer;

    &::-webkit-calendar-picker-indicator {
      position: absolute;
      inset: 0;
      width: auto;
      height: auto;
      opacity: 0;
    }
  }

  .ts-swap {
    position: absolute;
    top: -0.9rem;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    line-height: 0.6;
    color: var(--text-secondary);
    background: var(--bg-level1, var(--bg-card));
  }

  .ts-dot {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--c, var(--text-muted));
  }

  .ts-amount {
    font-family: var(--font-num);
    font-weight: 600;
    color: var(--tone);
  }

  .ts-expr {
    font-weight: 400;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* --- Descripción, fotos y origen --- */
  .ts-extra {
    margin-top: var(--sp-12);
    padding: var(--sp-4) var(--sp-16) 0;
    border-top: 0.375rem solid var(--bg-hover);
  }

  .ts-notes {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    border-bottom: 1px solid var(--border);

    & textarea {
      flex: 1;
      min-height: 2.5rem;
      padding: var(--sp-10) var(--sp-4);
      border: 0;
      outline: 0;
      background: none;
      font: inherit;
      color: var(--text-primary);
      field-sizing: content;
      resize: none;
    }
  }

  .ts-photo {
    flex: none;
    color: var(--text-muted);
    cursor: pointer;

    & input {
      display: none;
    }
  }

  .ts-files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    padding-top: var(--sp-8);
  }

  .ts-file {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    max-width: 100%;
    padding: var(--sp-4) var(--sp-10);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 99px);
    font-size: var(--text-xs);
    color: var(--text-secondary);

    &.new {
      border-style: dashed;
    }

    & button {
      display: flex;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
    }
  }

  .ts-origin {
    margin: var(--sp-10) 0 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .ts-raw {
    margin: var(--sp-6) 0 0;
    padding: var(--sp-10);
    border-radius: var(--radius-sm);
    background: var(--bg-field);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    color: var(--text-secondary);
  }

  /* --- Botones --- */
  .ts-actions {
    display: flex;
    gap: var(--sp-10);
    padding: var(--sp-16) var(--sp-16) 0;
  }

  .ts-btn {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
    min-width: 0;
    min-height: 2.5rem;
    padding: 0 var(--sp-8);
    border: 1px solid var(--border-strong, var(--border));
    border-radius: var(--radius-pill, 99px);
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-primary);
    white-space: nowrap;
    cursor: pointer;

    &.main {
      border-color: transparent;
      background: var(--tone);
      color: #fff;
      font-weight: 600;
    }

    &.wide {
      flex: 2.5;
    }

    &:disabled {
      opacity: 0.6;
    }
  }

  /* En oscuro los tonos son claros: el texto encima va oscuro para leerse. */
  :global([data-theme="dark"]) .ts :is(.ts-btn.main, .ts-keys .done) {
    color: oklch(0.2 0 0);
  }

  /* --- El panel de abajo --- */
  .ts-panel {
    position: absolute;
    inset: auto 0 0 0;
    display: flex;
    flex-direction: column;
    max-height: 55dvh;
    padding-bottom: env(safe-area-inset-bottom);
    /* Vidrio, pero sin que lo de atrás se lea: el velo del nivel 2 y un buen desenfoque. */
    background: var(--glass-2, var(--bg-level2));
    -webkit-backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(var(--glass-blur, 16px)) saturate(var(--glass-sat, 170%));
    box-shadow: 0 -10px 30px oklch(0 0 0 / 0.18);
    animation: up 0.18s ease-out;
  }

  :global([data-theme="dark"]) .ts-panel {
    background: oklch(0.23 0 0 / 0.82);
    border-top: 1px solid oklch(1 0 0 / 0.12);
  }

  @keyframes up {
    from {
      translate: 0 100%;
    }
  }

  .ts-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-4) var(--sp-8) var(--sp-4) var(--sp-16);
    border-bottom: 1px solid var(--border);
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .ts-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow-y: auto;
    overscroll-behavior: contain;

    & button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-4);
      min-height: 3.25rem;
      padding: var(--sp-6) var(--sp-4);
      border: 0;
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      background: none;
      font: inherit;
      font-size: var(--text-xs);
      line-height: 1.2;
      color: var(--text-primary);
      text-align: center;
      overflow-wrap: break-word;
      hyphens: auto;
      cursor: pointer;

      &:nth-child(3n) {
        border-right: 0;
      }

      & :global(i) {
        color: var(--c);
      }

      &:active {
        background: var(--bg-hover);
      }

      &.on {
        background: color-mix(in oklch, var(--c, var(--tone)) 16%, transparent);
        font-weight: 600;
      }

      &.none {
        color: var(--text-muted);
      }
    }
  }

  .ts-keys {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));

    & button {
      min-height: 3rem;
      border: 0;
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      background: none;
      font-family: var(--font-num);
      font-size: 1.125rem;
      color: var(--text-primary);
      cursor: pointer;
      touch-action: manipulation;

      &:nth-child(4n) {
        border-right: 0;
      }

      &:active {
        background: var(--bg-hover);
      }

      &.done {
        border: 0;
        background: var(--tone);
        font-family: inherit;
        font-size: var(--text-sm);
        font-weight: 600;
        color: #fff;
      }
    }
  }
</style>
