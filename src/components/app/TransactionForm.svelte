<!--
  Crear o editar una transacción: gasto, ingreso o transferencia entre
  cuentas, con categoría, etiquetas, notas y adjuntos.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import type { TxType } from "../../lib/finance";
  import { today } from "../../lib/finance";
  import { SOURCE_LABEL, TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { offline } from "../../lib/offline.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { go } from "../../lib/router.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import { ruleLabel } from "../../lib/rules";
  import type { Rule, Transaction, TxDraft } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea } from "../ui";
  import AccountSelect from "./AccountSelect.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import RuleForm from "./RuleForm.svelte";
  import Segmented from "./Segmented.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    tx = null,
    preset,
    draft,
    origin,
    onClose,
    onSaved,
    knownTags = [],
  }: {
    open: boolean;
    tx?: Transaction | null;
    /** Valores de partida para una nueva (la cuenta desde la que se abre, por ejemplo). */
    preset?: Partial<Pick<Transaction, "type" | "account" | "category">>;
    /** Todo ya llenado: lo que se leyó de un correo de la bandeja. */
    draft?: TxDraft | null;
    /** El correo del que sale: queda guardado con el movimiento tal como llegó. */
    origin?: { external_id: string; raw: string; source: "gmail" | "texto"; sender?: string } | null;
    onClose: () => void;
    onSaved?: () => void;
    knownTags?: string[];
  } = $props();

  let type = $state<TxType>("expense");
  let amount = $state(0);
  let date = $state(today());
  let account = $state("");
  let toAccount = $state("");
  let category = $state("");
  let description = $state("");
  let notes = $state("");
  let tags = $state<string[]>([]);
  let files = $state<File[]>([]);
  let removed = $state<string[]>([]);
  let busy = $state(false);
  let confirmDelete = $state(false);
  let showRaw = $state(false);
  /** La regla que lo creó, abierta encima; al cerrarla se vuelve aquí. */
  let rule = $state<Rule | null>(null);

  async function openRule() {
    if (!tx?.rule) return;
    try {
      rule = tx.expand?.rule ?? (await pb.collection("rules").getOne<Rule>(tx.rule));
    } catch (err) {
      notify.fail(err);
    }
  }

  // Se llena al abrir o al cambiar de tx, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open) return;
    void tx;
    untrack(() => {
      type = tx?.type ?? draft?.type ?? preset?.type ?? "expense";
      amount = tx?.amount ?? draft?.amount ?? 0;
      date = tx ? tx.date.slice(0, 10) : (draft?.date ?? today());
      account = tx?.account ?? (draft?.account || preset?.account || store.activeAccounts[0]?.id || "");
      toAccount = tx?.to_account ?? draft?.to_account ?? "";
      category = tx?.category ?? draft?.category ?? preset?.category ?? "";
      description = tx?.description ?? draft?.description ?? "";
      notes = tx?.notes ?? draft?.notes ?? "";
      tags = [...(tx?.tags ?? draft?.tags ?? [])];
      files = [];
      removed = [];
      rule = null;
      showRaw = false;
    });
  });

  const cats = $derived(store.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")));

  // Al cambiar de tipo, una categoría del otro lado deja de valer.
  $effect(() => {
    if (category && !cats.some((c) => c.id === category)) category = "";
  });

  const existing = $derived((tx?.attachments ?? []).filter((f) => !removed.includes(f)));
  let fileToken = $state("");
  $effect(() => {
    if (open && tx?.attachments?.length) {
      pb.files
        .getToken()
        .then((t) => (fileToken = t))
        .catch(() => {});
    }
  });

  async function save() {
    if (!amount || amount <= 0) return notify.fail(new Error("Escribe la cantidad de dinero."));
    if (!account) return notify.fail(new Error("Elige la cuenta."));
    if (type === "transfer" && (!toAccount || toAccount === account))
      return notify.fail(new Error("Elige una cuenta de destino distinta."));
    busy = true;
    try {
      const data: Record<string, unknown> = {
        owner: session.id,
        type,
        amount,
        date: `${date} 12:00:00.000Z`,
        account,
        to_account: type === "transfer" ? toAccount : "",
        category: type === "transfer" ? "" : category,
        description: description.trim(),
        notes,
        tags,
      };
      // Lo que viene de un correo guarda de dónde salió; así la bandeja lo da por hecho.
      const born = origin ? { source: origin.source, external_id: origin.external_id, raw: origin.raw.slice(0, 4000) } : { source: "manual" };
      if (files.length || removed.length) {
        // Los adjuntos van directo al servidor: necesitan conexión.
        if (files.length) data["attachments+"] = files;
        if (removed.length) data["attachments-"] = removed;
        if (tx) await pb.collection("transactions").update(tx.id, data);
        else await pb.collection("transactions").create({ ...data, ...born });
        touchTransactions();
      } else if (tx) {
        // Lo demás pasa por la cola: funciona sin internet y se envía después.
        await offline.update("transactions", tx.id, data, tx);
      } else {
        await offline.create("transactions", { ...data, ...born });
      }
      notify.done(!offline.online ? "Guardado sin conexión. Se enviará al reconectar." : tx ? "Guardado" : "Movimiento creado");
      onSaved?.();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!tx) return;
    busy = true;
    try {
      await offline.remove("transactions", tx.id, tx);
      confirmDelete = false;
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  const title = $derived(tx ? "Editar movimiento" : origin ? "Movimiento del correo" : "Nuevo movimiento");

  /** Si vino de un correo de la bandeja: ahí se ve el correo y su regla. */
  const fromMail = (t: Transaction) => !!t.external_id && (t.source === "gmail" || t.source === "texto");
</script>

<Modal open={open && !rule} {onClose} {title}>
  <div class="tx-form">
    <Segmented bind:value={type} options={TX_TYPES} full label="Tipo" />

    <div class="form-grid">
      <Field label="Cantidad">
        <MoneyInput bind:value={amount} autofocus={!tx} />
      </Field>
      <Field label="Fecha">
        <input type="date" class="field-control w-full" bind:value={date} />
      </Field>
      <Field label={type === "transfer" ? "Desde" : "Cuenta"}>
        <AccountSelect bind:value={account} senders={origin?.sender ? [origin.sender] : []} />
      </Field>
      {#if type === "transfer"}
        <Field label="Hacia">
          <AccountSelect bind:value={toAccount} placeholder="Elige…" exclude={account} />
        </Field>
      {:else}
        <Field label="Categoría">
          <Select bind:value={category}>
            <option value="">Sin categoría</option>
            {#each cats as c (c.id)}
              <option value={c.id}>{c.name}{c.tags?.length ? ` · ${c.tags.map((t) => `#${t}`).join(" ")}` : ""}</option>
            {/each}
          </Select>
        </Field>
      {/if}
    </div>

    <Field label="Descripción">
      <Input bind:value={description} placeholder="Mercado del mes, almuerzo, arriendo…" />
    </Field>

    <Field label="Etiquetas">
      <TagInput bind:value={tags} suggestions={knownTags} />
    </Field>

    <Field label="Notas">
      <Textarea bind:value={notes} rows={2} />
    </Field>

    <div>
      <p class="eyebrow">Adjuntos</p>
      <div class="attach-list">
        {#each existing as f (f)}
          <div class="attach">
            <a
              href={pb.files.getURL(tx!, f, { token: fileToken })}
              target="_blank"
              rel="noreferrer"
              class="attach-name"
            >
              <Icon name="attachment-01" />{f.replace(/_[a-z0-9]{10}(\.[^.]+)$/i, "$1")}
            </a>
            <button type="button" class="btn-icon sm" aria-label="Quitar adjunto" onclick={() => (removed = [...removed, f])}>
              <Icon name="cancel-01" size={12} />
            </button>
          </div>
        {/each}
        {#each files as f, i (i)}
          <div class="attach attach-new">
            <span class="attach-name"><Icon name="file-attachment" />{f.name}</span>
            <button type="button" class="btn-icon sm" aria-label="Quitar" onclick={() => (files = files.filter((_, j) => j !== i))}>
              <Icon name="cancel-01" size={12} />
            </button>
          </div>
        {/each}
      </div>
      <label class="dropzone attach-drop">
        <Icon name="attachment-01" size={18} />
        <span class="dropzone-lead">Agregar factura, recibo o foto</span>
        <span class="dropzone-hint">Imágenes o PDF, hasta 10 MB</span>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          class="dropzone-input"
          onchange={(e) => {
            const list = [...(e.currentTarget.files ?? [])];
            files = [...files, ...list];
            e.currentTarget.value = "";
          }}
        />
      </label>
    </div>

    {#if origin && !tx}
      <div class="tx-origin">
        <span>Origen: <b>{SOURCE_LABEL[origin.source]}</b></span>
        <button type="button" class="link" onclick={() => (showRaw = !showRaw)}>{showRaw ? "Ocultar" : "Ver"} texto original</button>
      </div>
      {#if showRaw}<pre class="tx-raw">{origin.raw}</pre>{/if}
    {:else if tx && ((tx.source && tx.source !== "manual") || tx.rule)}
      <div class="tx-origin">
        <span>
          {#if tx.source && tx.source !== "manual"}Origen: <b>{SOURCE_LABEL[tx.source] ?? tx.source}</b>{/if}
          {#if tx.rule}
            <button type="button" class="tx-origin-rule" data-tip="Ver la regla" onclick={openRule}>
              <Icon name="flash" size={12} />Creado con la regla <b>«{ruleLabel(tx.expand?.rule)}»</b>
            </button>
          {/if}
        </span>
        {#if tx.raw}
          <button type="button" class="link" onclick={() => (showRaw = !showRaw)}>
            {showRaw ? "Ocultar" : "Ver"} texto original
          </button>
        {/if}
      </div>
      {#if showRaw}<pre class="tx-raw">{tx.raw}</pre>{/if}
    {/if}
  </div>

  {#snippet footer()}
    {#if tx}
      <!--
        Borrar y Crear regla van en icono, con su globo de ayuda: con el
        texto, los cuatro botones no caben en la fila y se montaban.
      -->
      <button
        type="button"
        class="btn-icon foot-icon foot-danger"
        aria-label="Borrar"
        data-tip="Borrar"
        onclick={() => (confirmDelete = true)}
      >
        <Icon name="delete-02" size={18} />
      </button>
      {#if fromMail(tx)}
        <button
          type="button"
          class="btn-icon foot-icon"
          aria-label="Ver el correo"
          data-tip="Ver correo y regla"
          onclick={() => {
            onClose();
            go("/correos", { correo: tx.external_id });
          }}
        >
          <Icon name="mail-open-01" size={18} />
        </button>
      {:else if tx.description}
        <button
          type="button"
          class="btn-icon foot-icon"
          aria-label="Crear regla"
          data-tip="Crear regla para este texto"
          onclick={() => {
            onClose();
            go("/ajustes", { regla: tx.description });
          }}
        >
          <Icon name="flash" size={18} />
        </button>
      {/if}
      <span class="flex-1 foot-break"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>

<!-- Si la regla cambia, puede rehacer este movimiento: se cierra todo. -->
<RuleForm
  open={open && !!rule}
  {rule}
  onClose={() => (rule = null)}
  onSaved={() => {
    rule = null;
    onSaved?.();
    onClose();
  }}
/>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Borrar movimiento"
  message="Se borra con sus adjuntos. No se puede deshacer."
  {busy}
  onConfirm={remove}
/>

<style>
  .tx-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }

  .foot-icon {
    flex: none;
    width: 3rem;
    height: 3rem;
  }

  .foot-danger {
    color: var(--danger);
  }

  /* En el teléfono no caben los cuatro: Cancelar y Guardar arriba,
     repartiéndose el ancho, y los iconos en la fila de abajo. */
  @media (max-width: 30rem) {
    .foot-break {
      display: none;
    }

    .foot-icon {
      order: 1;
    }

    :global(.modal-foot:has(.foot-icon) > .btn) {
      flex: 1 1 calc(50% - 0.3125rem);
      justify-content: center;
    }
  }

  /* Una sola columna, siempre: un campo debajo del otro. */
  .tx-form .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .attach-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-bottom: var(--sp-8);

    &:empty {
      display: none;
    }
  }

  .attach {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    padding: var(--sp-6) var(--sp-10);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .attach-new {
    border-style: dashed;
  }

  .attach-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
  }

  .attach-drop {
    padding: var(--sp-14);
  }

  .tx-origin {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4) var(--sp-12);
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .tx-origin-rule {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-start: var(--sp-8);
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;

    &:hover b {
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }
  }

  .tx-raw {
    margin: 0;
    padding: var(--sp-10);
    border-radius: var(--radius-sm);
    background: var(--bg-field);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    color: var(--text-secondary);
  }
</style>
