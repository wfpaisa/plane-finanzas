<!--
  Crear o editar una regla: "si el movimiento dice X, es tal cosa". Al
  guardarla se puede aplicar de una vez a lo que ya está importado.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { monthName } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { Rule } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Switch } from "../ui";
  import MoneyInput from "./MoneyInput.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    rule = null,
    initialMatch = "",
    onClose,
    onSaved,
  }: {
    open: boolean;
    rule?: Rule | null;
    /** Para crearla desde un movimiento: su texto. */
    initialMatch?: string;
    onClose: () => void;
    onSaved: () => void;
  } = $props();

  let match = $state("");
  let amount = $state(0);
  let category = $state("");
  let tags = $state<string[]>([]);
  let description = $state("");
  let toNotes = $state(true);
  let paused = $state(false);
  let applyNow = $state(true);
  let busy = $state(false);
  let confirmDelete = $state(false);

  $effect(() => {
    if (!open) return;
    void rule;
    untrack(() => {
      match = rule?.match ?? initialMatch;
      amount = rule?.amount ?? 0;
      category = rule?.category ?? "";
      tags = [...(rule?.tags ?? [])];
      description = rule?.description ?? "";
      toNotes = rule ? rule.to_notes : true;
      paused = rule?.paused ?? false;
      applyNow = true;
    });
  });

  // El mismo cálculo que hace el servidor (lib/rules.js), para ver el
  // resultado antes de guardar.
  const example = $derived(match.split(",")[0]?.trim().toUpperCase() || "GOU PAYMENTS S A");
  const today = new Date();
  const preview = $derived(
    description
      .replace(/\{mes\}/gi, monthName(today.getMonth() + 1))
      .replace(/\{año\}|\{ano\}/gi, String(today.getFullYear()))
      .replace(/\{original\}/gi, example)
      .replace(/\s+/g, " ")
      .trim(),
  );

  async function save() {
    if (!match.trim()) return notify.fail(new Error("Escribe qué texto debe tener el movimiento."));
    busy = true;
    try {
      const data = { owner: session.id, match: match.trim(), amount: amount > 0 ? amount : 0, category, tags, description: description.trim(), to_notes: toNotes, paused };
      const saved = rule ? await pb.collection("rules").update<Rule>(rule.id, data) : await pb.collection("rules").create<Rule>(data);
      let msg = rule ? "Regla guardada" : "Regla creada";
      if (applyNow && !paused) {
        const r = await pb.send<{ changed: number }>("/api/finanzas/rules/apply", { method: "POST", body: { rule: saved.id } });
        msg += r.changed ? ` · ${r.changed} ${r.changed === 1 ? "movimiento actualizado" : "movimientos actualizados"}` : " · ningún movimiento cambió";
        if (r.changed) touchTransactions();
      }
      notify.done(msg);
      onSaved();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!rule) return;
    busy = true;
    try {
      await pb.collection("rules").delete(rule.id);
      confirmDelete = false;
      onSaved();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} {onClose} title={rule ? "Editar regla" : "Nueva regla"} width="modal-panel-width-lg">
  <div class="rule-form">
    <div class="match-grid">
      <Field
        label="Si el movimiento dice"
        tip="Texto que trae el correo del banco. Puedes poner varios separados por coma; basta con que aparezca uno. No importan mayúsculas ni tildes."
      >
        <Input bind:value={match} placeholder="GOU PAYMENTS, EASPBV" autofocus />
      </Field>
      <Field
        label="Y el valor es"
        tip="Opcional. Si lo escribes, la regla solo aplica cuando el movimiento trae exactamente ese valor. Vacío: cualquier valor. Una regla con valor gana sobre otra con el mismo texto sin valor."
      >
        <MoneyInput bind:value={amount} placeholder="Cualquiera" />
      </Field>
    </div>

    <div class="form-grid">
      <Field label="Categoría" tip="La categoría que toma el movimiento. Manda sobre las palabras clave de las categorías.">
        <Select bind:value={category}>
          <option value="">No cambiarla</option>
          <optgroup label="Gastos">
            {#each store.categories.filter((c) => c.kind === "expense") as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </optgroup>
          <optgroup label="Ingresos">
            {#each store.categories.filter((c) => c.kind === "income") as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </optgroup>
        </Select>
      </Field>
      <Field
        label="Nueva descripción"
        tip={"Cómo se verá en la lista. Puedes usar {mes}, {año} y {original} (el texto del banco). Vacía, se deja la del banco."}
      >
        <Input bind:value={description} placeholder={"Administración {mes}"} />
      </Field>
    </div>

    <Field label="Etiquetas" tip="Se agregan a las que ya tenga el movimiento. Escribe y pulsa Enter.">
      <TagInput bind:value={tags} />
    </Field>

    {#if description.trim()}
      <p class="rule-preview">
        <span class="muted">Ejemplo:</span>
        <s>{example}</s>
        <Icon name="arrow-right-02" size={14} />
        <b>{preview}</b>
      </p>
    {/if}

    <div class="form-switches">
      <Switch bind:checked={toNotes} label="Pasar el texto del banco a las notas" />
      {#if rule}<Switch bind:checked={paused} label="En pausa" />{/if}
      {#if !paused}<Switch bind:checked={applyNow} label="Aplicar también a lo que ya está importado" />{/if}
    </div>
  </div>

  {#snippet footer()}
    {#if rule}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Borrar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Borrar regla"
  message="Los movimientos que ya cambió se quedan como están."
  {busy}
  onConfirm={remove}
/>

<style>
  .rule-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }

  .match-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--sp-16);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .rule-preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
    margin: 0;
    padding: var(--sp-10) var(--sp-12);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    font-size: var(--text-sm);

    & s {
      color: var(--text-muted);
    }
  }

  .form-switches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-12) var(--sp-20);
  }
</style>
