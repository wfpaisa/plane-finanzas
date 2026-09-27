<!--
  Anotar o editar un movimiento en el celular, a pantalla completa y como en
  las apps de gastos de siempre: arriba el tipo, luego una fila por dato y,
  al tocar una fila, su panel abajo —la cuadrícula de cuentas, la de
  categorías o un teclado de números— en vez del teclado del teléfono.

  Al anotar, cada elección pasa sola a la siguiente: cuenta → categoría →
  importe → descripción. "Continuar" guarda y deja la pantalla lista para otro con
  la misma fecha y cuenta.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import type { TxType } from "../../lib/finance";
  import { today } from "../../lib/finance";
  import { colorsFor } from "../../lib/colors";
  import { dateYmd, money, plainNumber } from "../../lib/format";
  import { accountTypeIcon, SOURCE_LABEL, TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { offline } from "../../lib/offline.svelte";
  import { colorOf } from "../../lib/palettes";
  import { pb, session } from "../../lib/pb.svelte";
  import { closeOnBack } from "../../lib/router.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";
  import type { TxPreset } from "../../lib/ui.svelte";
  import Icon from "../Icon.svelte";
  import Segmented from "../app/Segmented.svelte";
  import { Calendar, ConfirmDialog } from "../ui";

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

  type Panel = "date" | "account" | "to" | "category" | "amount" | null;

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
    if (open) return closeOnBack(onClose);
  });
  const hasPanel = $derived(open && !!panel);
  $effect(() => {
    if (hasPanel) return closeOnBack(() => (panel = null));
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
    return `${dateYmd(date)} (${DAYS[new Date(y, m - 1, d).getDay()]})`;
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
      notify.done("Movimiento eliminado");
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
        <div class="ts-row" class:focus={panel === "date"}>
          <span class="ts-label">Fecha</span>
          <button type="button" class="ts-value" onclick={() => (panel = "date")}>{dateLabel}</button>
        </div>

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
          <span class="ts-label">Monto</span>
          <button type="button" class="ts-value ts-amount" onclick={() => (panel = "amount")}>
            {#if hasOps}
              <span class="ts-expr">{exprLabel}</span>{#if hasSum}<span>= {money(amount)}</span>{/if}
            {:else if expr}
              {money(amount)}
            {/if}
          </button>
        </div>

        <label class="ts-row">
          <span class="ts-label">Descripción</span>
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
          <textarea placeholder="Notas" rows="1" bind:value={notes} onfocus={() => (panel = null)}></textarea>
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

  </div>

  <!-- Fuera de .ts: la pantalla ya lleva un desenfoque de fondo (estilo
       sólido) y en el teléfono uno dentro de otro no se pinta. Aparte, el
       vidrio del panel desenfoca lo que tiene detrás. -->
  {#if panel}
    <section class="ts-panel" data-type={type} aria-label={panel === "date" ? "Fecha" : panel === "amount" ? "Monto" : panel === "category" ? "Categoría" : "Cuentas"}>
      <div class="ts-panel-head">
        <strong>{panel === "date" ? "Fecha" : panel === "amount" ? "Monto" : panel === "category" ? "Categoría" : panel === "to" ? "Hacia la cuenta" : "Cuentas"}</strong>
        <button type="button" class="btn-icon sm" aria-label="Cerrar" onclick={() => (panel = null)}>
          <Icon name="cancel-01" size={18} />
        </button>
      </div>

      {#if panel === "date"}
        <div class="ts-cal">
          <Calendar
            mode="day"
            value={date}
            onpick={(d) => {
              date = d;
              panel = null;
            }}
          />
        </div>
      {:else if panel === "account" || panel === "to"}
        <div class="ts-grid">
          {#each store.activeAccounts.filter((a) => panel === "account" || a.id !== account) as a (a.id)}
            {@const on = (panel === "to" ? toAccount : account) === a.id}
            <button type="button" class:on style:--c={colorOf(a.palette)} onclick={() => pickAccount(a.id)}>
              <span class="ts-ico"><Icon name={a.icon || accountTypeIcon(a.type)} size={18} /></span>{a.name}
            </button>
          {/each}
        </div>
      {:else if panel === "category"}
        <div class="ts-grid">
          {#each cats as c (c.id)}
            <button type="button" class:on={category === c.id} style:--c={catColor(c.id)} onclick={() => pickCategory(c.id)}>
              <span class="ts-ico"><Icon name={c.icon || "tag-01"} size={18} /></span>{c.name}
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

  <ConfirmDialog
    open={confirmDelete}
    onClose={() => (confirmDelete = false)}
    title="Eliminar movimiento"
    message="Se eliminará con sus adjuntos. No se puede deshacer."
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
    /* El lienzo de escritorio, con su degradado. */
    background: var(--canvas-wash), var(--canvas);
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

  /* --- Las filas: etiqueta a la izquierda y el campo hundido de escritorio --- */
  .ts-rows {
    display: grid;
    gap: var(--sp-6);
    padding: var(--sp-4) var(--sp-16) 0;
  }

  .ts-row {
    position: relative;
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    align-items: center;
    min-height: 2.375rem;
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
    min-height: 2.375rem;
    padding: 0 var(--sp-16);
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--field-bg);
    box-shadow: var(--field-shadow);
    font: inherit;
    font-weight: 500;
    color: var(--text-primary);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition:
      background 0.15s,
      box-shadow 0.15s;
  }


  /* Sin anillo de foco, como en escritorio: el campo se aclara, y el del
     panel abierto lleva un filo del color del tipo. */
  .ts-row:focus-within .ts-value {
    background: var(--field-bg-focus);
  }

  .ts-row.focus .ts-value {
    background: var(--field-bg-focus);
    box-shadow:
      var(--field-shadow),
      inset 0 0 0 1.5px var(--tone);
  }

  .ts-input {
    grid-column: 2 / -1;
    outline: 0;
    cursor: text;
  }

  .ts-row:not(:has(.ts-swap)) .ts-value {
    grid-column: 2 / -1;
  }

  /* El calendario, del ancho del panel y con días grandes para el dedo. */
  .ts-cal {
    padding: 0 var(--sp-4) var(--sp-8);

    & :global(.vc) {
      width: 100%;
      max-width: 24rem;
      margin: 0 auto;
    }

    & :global(.vc-date__btn) {
      min-height: 2.5rem;
    }
  }

  .ts-swap {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-left: var(--sp-6);
    line-height: 0.6;
    color: var(--text-secondary);
    background: var(--bg-field);
    box-shadow: var(--pillow);
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

  /* --- Notas, fotos y origen --- */
  .ts-extra {
    margin-top: var(--sp-16);
    padding: 0 var(--sp-16);
  }

  .ts-notes {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-8);

    & textarea {
      flex: 1;
      min-height: 3rem;
      padding: var(--sp-10) var(--sp-16);
      border: 0;
      border-radius: 1.375rem;
      outline: 0;
      background: var(--field-bg);
      box-shadow: var(--field-shadow);
      font: inherit;
      font-weight: 500;
      color: var(--text-primary);
      field-sizing: content;
      resize: none;

      &:focus {
        background: var(--field-bg-focus);
      }

      &::placeholder {
        color: var(--text-subtle, var(--text-muted));
        font-weight: 450;
      }
    }
  }

  .ts-photo {
    flex: none;
    background: var(--bg-field);
    box-shadow: var(--pillow);
    color: var(--text-secondary);
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
    border: 0;
    border-radius: var(--radius-pill, 99px);
    /* Los botones de escritorio: sobresalen con la almohada. */
    background: var(--bg-field);
    box-shadow: var(--pillow);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    cursor: pointer;
    transition: transform 0.15s;

    &:active {
      transform: scale(0.97);
    }

    &.main {
      background: var(--tone);
      box-shadow:
        inset 0 1px 0 oklch(1 0 0 / 0.16),
        0 10px 22px -12px oklch(from var(--tone) l c h / 0.8);
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
  .ts-panel[data-type="income"] {
    --tone: var(--success);
  }

  .ts-panel[data-type="transfer"] {
    --tone: var(--transfer);
  }

  :global([data-theme="dark"]) :is(.ts .ts-btn.main, .ts-panel .ts-keys .done) {
    color: oklch(0.2 0 0);
  }

  /* --- El panel de abajo --- */

  .ts-panel {
    --tone: var(--danger);
    position: fixed;
    inset: auto 0 0 0;
    z-index: 46;
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    max-height: 55dvh;
    padding-bottom: env(safe-area-inset-bottom);
    overflow: hidden;
    /* Vidrio de verdad: el velo del nivel 2 más ralo que en los menús, para
       que se adivine el formulario detrás, y mucho desenfoque para que no
       se lea. */
    /* Recto arriba: va pegado de lado a lado, como un teclado. */
    border-top: 1px solid var(--glass-rim, var(--border));
    background: var(--glass-sheen, none), oklch(from var(--glass-2, var(--bg-level2)) l c h / 0.5);
    -webkit-backdrop-filter: blur(calc(var(--glass-blur, 16px) * 1.2)) saturate(var(--glass-sat, 170%));
    backdrop-filter: blur(calc(var(--glass-blur, 16px) * 1.2)) saturate(var(--glass-sat, 170%));
    box-shadow:
      var(--glass-spec, none),
      0 -12px 32px oklch(0 0 0 / 0.2);
    /* Las rayas de la cuadrícula, del mismo vidrio. */
    --line: oklch(from var(--text-primary) l c h / 0.08);
    animation: up 0.18s ease-out;
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
    border-bottom: 1px solid var(--line);
    color: var(--text-secondary);
  }

  .ts-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    /* Cada fila mide lo que su celda: con muchas opciones la cuadrícula se
       desplaza en vez de aplastar las filas contra la altura del panel. */
    grid-auto-rows: max-content;
    overflow-y: auto;
    overscroll-behavior: contain;

    & button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-6);
      min-height: 3.25rem;
      /* Aire arriba y abajo: la ficha del icono no toca las rayas. */
      padding: var(--sp-12) var(--sp-6);
      border: 0;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
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

  /* La ficha del icono: el color de la cuenta o la categoría, muy
     transparente detrás, como en las listas. */
  .ts-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.75rem;
    background: color-mix(in oklab, var(--c, var(--text-muted)) 8%, transparent);
    color: var(--c, var(--text-secondary));
  }

  .ts-keys {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));

    & button {
      min-height: 3rem;
      border: 0;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
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
