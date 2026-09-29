<!--
  Crear o editar el nombre de un comercio (su alias). Se abre desde Ajustes →
  Gmail o desde un correo de la bandeja, con el comercio que se leyó ya puesto
  (`sample`). Al guardar puede ponerle el nombre también a los movimientos que
  ya existen. Ver pb_hooks/lib/merchants.js.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Switch } from "../ui";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { findMerchant, TEXT_FILTERS } from "../../lib/rules";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { TxType } from "../../lib/finance";
  import type { Merchant } from "../../lib/types";

  let {
    open,
    merchant = null,
    sample = "",
    kind = "expense",
    onClose,
    onSaved,
  }: {
    open: boolean;
    merchant?: Merchant | null;
    /** El comercio como lo trae el correo ("IKEA ENVIGADO"), para proponer y probar. */
    sample?: string;
    /** El tipo del movimiento del correo: ordena las categorías. */
    kind?: TxType;
    onClose: () => void;
    onSaved?: () => void;
  } = $props();

  let name = $state("");
  let match = $state("");
  let category = $state("");
  let applyOld = $state(true);
  let busy = $state(false);
  let confirmDelete = $state(false);

  /**
   * "IKEA ENVIGADO" -> "Ikea", que busca "ikea": sin el municipio, así sirve en
   * cualquier sede. No se acorta más: una sola palabra ("tienda") coincidiría
   * con comercios que no son.
   */
  function guess(text: string) {
    const clean = TEXT_FILTERS.sin_ciudad(text);
    return { name: TEXT_FILTERS.capitalizar(clean), match: clean.toLowerCase() };
  }

  $effect(() => {
    if (!open) return;
    const g = guess(sample);
    name = merchant?.name ?? g.name;
    match = merchant?.match ?? g.match;
    category = merchant?.category ?? "";
    applyOld = true;
  });

  const cats = $derived(
    [...store.categories].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === (kind === "income" ? "income" : "expense") ? -1 : 1)),
  );
  /** Si el comercio del correo quedaría reconocido con lo escrito. */
  const recognized = $derived(!sample || !!findMerchant(sample, [{ match }]));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return notify.fail(new Error("Escribe el nombre con que quieres ver este comercio."));
    if (!match.trim()) return notify.fail(new Error("Escribe al menos una parte del nombre que trae el correo, por ejemplo «ikea»."));
    busy = true;
    try {
      const data = { owner: session.id, name: name.trim(), match: match.trim(), category };
      const saved = merchant
        ? await pb.collection("merchants").update<Merchant>(merchant.id, data)
        : await pb.collection("merchants").create<Merchant>(data);
      let changed = 0;
      if (applyOld) {
        changed = (await pb.send<{ changed: number }>("/api/finanzas/merchants/apply", { method: "POST", body: { id: saved.id } })).changed;
        if (changed) touchTransactions();
      }
      notify.done(
        changed ? `Comercio guardado. ${changed} ${changed === 1 ? "movimiento cambió" : "movimientos cambiaron"} de nombre.` : "Comercio guardado.",
      );
      onSaved?.();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!merchant) return;
    busy = true;
    try {
      await pb.collection("merchants").delete(merchant.id);
      confirmDelete = false;
      notify.done("Comercio eliminado.");
      onSaved?.();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal open={open && !confirmDelete} {onClose} title={merchant ? "Editar comercio" : "Nombrar comercio"} icon="store-01">
  <form id="merchant-form" class="stack" onsubmit={save}>
    {#if sample}
      <p class="merchant-sample">
        <span class="muted">En el correo dice</span>
        <b>{sample}</b>
        <Icon name="arrow-right-01" size={14} />
        <b>{name || "…"}</b>
      </p>
    {/if}
    <Field label="Nombre del comercio" hint="Así aparecerá en la descripción de los movimientos.">
      <Input bind:value={name} maxlength={120} placeholder="Ikea" autofocus required />
    </Field>
    <Field
      label="El comercio del correo contiene"
      hint="Una o varias partes del nombre que trae el correo, separadas por comas. También sirve la cuenta o la llave a la que enviaste dinero, como 12345678901 o @ana123. No importan mayúsculas ni tildes."
    >
      <Input bind:value={match} maxlength={500} placeholder="ikea" required />
    </Field>
    {#if !recognized}
      <p class="merchant-warn"><Icon name="alert-02" size={14} />«{sample}» no contiene ninguno de estos textos: este correo no quedaría con el nombre nuevo.</p>
    {/if}
    <Field label="Categoría (opcional)" hint="Si eliges una, los movimientos de este comercio la tendrán, aunque las palabras clave o la regla digan otra.">
      <Select bind:value={category}>
        <option value="">Sin categoría: usar las palabras clave</option>
        {#each cats as c (c.id)}
          <option value={c.id}>{c.name} · {c.kind === "income" ? "Ingreso" : "Gasto"}</option>
        {/each}
      </Select>
    </Field>
    <Switch bind:checked={applyOld} label="Cambiar también los movimientos que ya existen" />
    <p class="small muted merchant-note">
      Solo cambian los movimientos importados de correos o de archivos del banco. No se tocan los que anotaste a mano ni los que una regla nombró con un texto fijo.
    </p>
  </form>
  {#snippet footer()}
    {#if merchant}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Eliminar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" type="submit" form="merchant-form" loading={busy}>{merchant ? "Guardar cambios" : "Guardar comercio"}</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Eliminar comercio"
  message={`Los movimientos que ya se llaman «${merchant?.name}» conservan su nombre. Los correos nuevos de este comercio usarán el nombre que trae el correo.`}
  confirmLabel="Eliminar comercio"
  {busy}
  onConfirm={remove}
/>

<style>
  .merchant-sample {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6);
    margin: 0;
    padding: var(--sp-10) var(--sp-12);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    font-size: var(--text-sm);
  }

  .merchant-warn {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    margin: calc(var(--sp-6) * -1) 0 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .merchant-note {
    margin: calc(var(--sp-8) * -1) 0 0;
  }
</style>
