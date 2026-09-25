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
  import type { Transaction } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea } from "../ui";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    tx = null,
    preset,
    onClose,
    knownTags = [],
  }: {
    open: boolean;
    tx?: Transaction | null;
    /** Valores de partida para una nueva (la cuenta desde la que se abre, por ejemplo). */
    preset?: Partial<Pick<Transaction, "type" | "account" | "category">>;
    onClose: () => void;
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

  // Se llena al abrir o al cambiar de tx, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open) return;
    void tx;
    untrack(() => {
      type = tx?.type ?? preset?.type ?? "expense";
      amount = tx?.amount ?? 0;
      date = tx ? tx.date.slice(0, 10) : today();
      account = tx?.account ?? preset?.account ?? store.activeAccounts[0]?.id ?? "";
      toAccount = tx?.to_account ?? "";
      category = tx?.category ?? preset?.category ?? "";
      description = tx?.description ?? "";
      notes = tx?.notes ?? "";
      tags = [...(tx?.tags ?? [])];
      files = [];
      removed = [];
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
      if (files.length || removed.length) {
        // Los adjuntos van directo al servidor: necesitan conexión.
        if (files.length) data["attachments+"] = files;
        if (removed.length) data["attachments-"] = removed;
        if (tx) await pb.collection("transactions").update(tx.id, data);
        else await pb.collection("transactions").create({ ...data, source: "manual" });
        touchTransactions();
      } else if (tx) {
        // Lo demás pasa por la cola: funciona sin internet y se envía después.
        await offline.update("transactions", tx.id, data, tx);
      } else {
        await offline.create("transactions", { ...data, source: "manual" });
      }
      notify.done(!offline.online ? "Guardado en el teléfono: se envía al volver la conexión" : tx ? "Guardado" : "Transacción agregada");
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

  const title = $derived(tx ? "Editar movimiento" : "Nuevo movimiento");
</script>

<Modal {open} {onClose} {title}>
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
        <Select bind:value={account}>
          {#each store.activeAccounts as a (a.id)}
            <option value={a.id}>{a.name}</option>
          {/each}
        </Select>
      </Field>
      {#if type === "transfer"}
        <Field label="Hacia">
          <Select bind:value={toAccount}>
            <option value="">Elige…</option>
            {#each store.activeAccounts.filter((a) => a.id !== account) as a (a.id)}
              <option value={a.id}>{a.name}</option>
            {/each}
          </Select>
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

    {#if tx && ((tx.source && tx.source !== "manual") || tx.rule)}
      <div class="tx-origin">
        <span>
          {#if tx.source && tx.source !== "manual"}Origen: <b>{SOURCE_LABEL[tx.source] ?? tx.source}</b>{/if}
          {#if tx.rule}
            <span class="tx-origin-rule"><Icon name="flash" size={12} />Ajustado por la regla <b>«{tx.expand?.rule?.match ?? "…"}»</b></span>
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
      {#if tx.description}
        <button
          type="button"
          class="btn-icon foot-icon"
          aria-label="Crear regla"
          data-tip="Crear regla: que los movimientos con este texto se categoricen solos"
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
    color: var(--accent);
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
