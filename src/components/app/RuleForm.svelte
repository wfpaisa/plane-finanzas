<!--
  Una regla: la plantilla con que se crean los movimientos de los correos que
  la cumplen. Se ve como el formulario de un movimiento, más la condición
  arriba y sin fecha (la de cada correo).

  Tres usos:
  - Desde un correo pendiente de la bandeja: crea la regla y el movimiento
    de ese correo; los pendientes y los nuevos que la cumplan la toman.
  - Desde un correo ya procesado con una regla: cambiar solo ese movimiento,
    o la regla y todo lo que creó.
  - Desde Ajustes: crear o editar una regla suelta.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { money } from "../../lib/format";
  import { TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";
  import { mailMatches, renderDescription } from "../../lib/rules";
  import { reload, store, touchTransactions } from "../../lib/store.svelte";
  import type { InboxRow, Rule, Suggestion } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Switch, Textarea } from "../ui";
  import AccountSelect from "./AccountSelect.svelte";
  import MailText from "./MailText.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    rule = null,
    mail = null,
    initialMatch = "",
    onClose,
    onSaved,
    knownTags = [],
  }: {
    open: boolean;
    /** La regla a editar; sin ella, una nueva. */
    rule?: Rule | null;
    /** El correo desde el que se abre, con lo que se leyó de él. */
    mail?: { row: InboxRow; suggestion: Suggestion; html?: string } | null;
    /** Para crearla desde un movimiento: su texto. */
    initialMatch?: string;
    onClose: () => void;
    onSaved: () => void;
    knownTags?: string[];
  } = $props();

  type RuleType = Rule["type"];

  let name = $state("");
  let sender = $state("");
  let match = $state("");
  let amount = $state(0);
  let type = $state<RuleType>("expense");
  let autoAmount = $state(true);
  let setAmount = $state(0);
  let account = $state("");
  let toAccount = $state("");
  let category = $state("");
  let description = $state("");
  let tags = $state<string[]>([]);
  let notes = $state("");
  let toNotes = $state(true);
  let paused = $state(false);
  let applyNow = $state(true);
  let busy = $state<"" | "rule" | "this">("");
  let confirmDelete = $state(false);

  $effect(() => {
    if (!open) return;
    void rule;
    void mail;
    untrack(() => {
      const tx = mail?.suggestion.tx;
      const pattern = mail?.suggestion.pattern;
      name = rule?.name ?? pattern?.match ?? "";
      sender = rule?.sender ?? pattern?.sender ?? "";
      match = rule?.match ?? pattern?.match ?? initialMatch;
      amount = rule?.amount ?? 0;
      // Con un correo, la plantilla muestra valores concretos: lo que la
      // regla no dice se llena con lo que se leyó de ese correo.
      type = rule?.type || tx?.type || (rule ? "" : "expense");
      setAmount = rule?.set_amount ?? 0;
      autoAmount = !setAmount;
      account = rule?.account || tx?.account || "";
      toAccount = rule?.to_account || tx?.to_account || "";
      category = rule?.category || tx?.category || "";
      description = rule?.description ?? tx?.description ?? "";
      tags = [...(rule?.tags ?? tx?.tags ?? [])];
      notes = rule?.notes ?? "";
      toNotes = rule ? rule.to_notes : !!mail;
      paused = rule?.paused ?? false;
      applyNow = true;
    });
  });

  // Las reglas de antes no decían el tipo: esa opción solo se ofrece a ellas.
  const types = $derived(rule && !rule.type ? [{ id: "" as RuleType, label: "Según el correo", icon: "mail-01" }, ...TX_TYPES] : TX_TYPES);
  const cats = $derived(store.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")));

  // Al cambiar de tipo, una categoría del otro lado deja de valer.
  $effect(() => {
    if (category && type && !cats.some((c) => c.id === category)) category = "";
  });

  /** Una cuenta creada desde aquí nace con el remitente de la regla. */
  const newSenders = $derived(sender.trim() ? [sender.trim().toLowerCase()] : []);

  /** El valor que trae el correo, sin la regla. */
  const mailAmount = $derived(mail?.suggestion.parsed?.amount ?? 0);
  const matches = $derived(
    mail
      ? mailMatches({ sender, match, amount }, { sender: mail.row.sender, subject: mail.row.subject, text: mail.row.text, amount: mailAmount })
      : true,
  );
  const date = $derived(mail?.suggestion.tx.date ?? new Date().toISOString().slice(0, 10));
  const original = $derived(mail?.suggestion.parsed?.description || mail?.row.subject || match.split(",")[0]?.trim().toUpperCase() || "GOU PAYMENTS S A");
  const preview = $derived(description.trim() ? renderDescription(description, date, original) : original);

  /** Si ya se procesó con esta regla: se puede cambiar solo su movimiento. */
  const usedHere = $derived(!!mail && !!rule && mail.row.status === "procesado");
  const title = $derived(usedHere ? "Regla de este movimiento" : rule ? "Editar regla" : "Nueva regla");

  function data() {
    return {
      id: rule?.id,
      name: name.trim() || match.split(",")[0]?.trim() || sender.trim(),
      sender: sender.trim(),
      match: match.trim(),
      amount: amount > 0 ? amount : 0,
      type,
      set_amount: autoAmount ? 0 : setAmount,
      account,
      to_account: type === "transfer" ? toAccount : "",
      category: type === "transfer" ? "" : category,
      description: description.trim(),
      tags,
      notes: notes.trim(),
      to_notes: toNotes,
      paused,
    };
  }

  function check(scope: "rule" | "this"): string {
    if (scope === "rule" && !sender.trim() && !match.trim()) return "Escribe un remitente o texto del correo.";
    if (!autoAmount && !(setAmount > 0)) return "Escribe la cantidad o usa la del correo.";
    if (mail) {
      if (!account) return "Elige la cuenta.";
      if (type === "transfer" && (!toAccount || toAccount === account)) return "Elige una cuenta de destino distinta.";
      if (autoAmount && !(mailAmount > 0)) return "Escribe la cantidad; el correo no la incluye.";
    }
    return "";
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  async function save(scope: "rule" | "this") {
    const problem = check(scope);
    if (problem) return notify.fail(new Error(problem));
    busy = scope;
    try {
      const r = await pb.send<{ created: number; updated: number; pending: number }>("/api/finanzas/inbox/rule", {
        method: "POST",
        body: { rule: data(), inbox: mail?.row.id, scope, apply: applyNow },
      });
      const parts: string[] = [];
      if (scope === "this") parts.push("Movimiento guardado; la regla no cambió");
      else {
        const label = data().name;
        parts.push(rule ? `Regla «${label}» guardada` : `Regla «${label}» creada`);
        if (r.created) parts.push(mail?.row.status === "procesado" ? "movimiento actualizado" : "movimiento creado");
        if (r.updated) parts.push(plural(r.updated, "movimiento actualizado", "movimientos actualizados"));
        if (r.pending) parts.push(plural(r.pending, "correo pendiente procesado", "correos pendientes procesados"));
      }
      notify.done(parts.join(" · "));
      if (r.created || r.updated || r.pending) touchTransactions();
      void reload("gmail");
      onSaved();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = "";
    }
  }

  async function remove() {
    if (!rule) return;
    busy = "rule";
    try {
      await pb.collection("rules").delete(rule.id);
      confirmDelete = false;
      onSaved();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = "";
    }
  }
</script>

<Modal {open} {onClose} {title} width="modal-panel-width-lg">
  <div class="rule-form">
    <section class="rule-when" aria-label="Cuándo se usa">
      <p class="rule-when-lead"><Icon name="flash" size={14} />Aplicar cuando el correo</p>
      <div class="when-grid">
        <Field label="Viene de" tip="Correo o dominio. Déjalo vacío para aceptar cualquier remitente.">
          <Input bind:value={sender} placeholder="alertas@banco.com" />
        </Field>
        <Field label="Contiene" tip="Separa varias opciones con comas. Basta con que coincida una.">
          <Input bind:value={match} placeholder="PANADERIA, GOU PAYMENTS" />
        </Field>
        <Field label="Valor" tip="Opcional. Debe coincidir exactamente.">
          <MoneyInput bind:value={amount} placeholder="Cualquiera" />
        </Field>
      </div>
      {#if mail}
        <p class="rule-check" class:ok={matches}>
          <Icon name={matches ? "checkmark-circle-02" : "alert-02"} size={14} />
          {#if matches}Este correo cumple la condición.{:else}Este correo no coincide. Su movimiento se creará, pero la regla no se aplicará a correos similares.{/if}
        </p>
      {/if}
      {#if mail}
        <MailText
          text={mail.row.text || mail.row.subject}
          rich={mail.row.rich}
          html={mail.html}
          amount={mailAmount}
          merchant={mail.suggestion.parsed?.merchant}
          keys={match}
          maxHeight="9rem"
        />
      {/if}
      {#if !match.trim() && sender.trim()}
        <p class="rule-check"><Icon name="alert-02" size={14} />La regla se aplicará a <b>todos</b> los correos de este remitente.</p>
      {/if}
    </section>

    <Field label="Nombre de la regla">
      <Input bind:value={name} placeholder="Panadería, arriendo, pago de la tarjeta…" autofocus={!mail} />
    </Field>

    <p class="rule-template-note">
      Los correos que coincidan crearán movimientos con estos datos.
    </p>

    <Segmented bind:value={type} options={types} full label="Tipo" />

    <div class="form-grid">
      <!-- Sin Field: su <label> no puede envolver al del interruptor, y su
           estilo de campo estiraría el interruptor. -->
      <div>
        <span class="field-label">Cantidad</span>
        <div class="amount-mode">
          <Switch bind:checked={autoAmount} label="Usar la del correo" />
          {#if autoAmount}
            <span class="muted small">{mail ? (mailAmount > 0 ? money(mailAmount) : "Sin cantidad") : "Cambia en cada correo"}</span>
          {:else}
            <div class="amount-value"><MoneyInput bind:value={setAmount} /></div>
          {/if}
        </div>
      </div>
      <Field label={type === "transfer" ? "Desde" : "Cuenta"}>
        <AccountSelect bind:value={account} placeholder={mail ? "Elige…" : "La del remitente"} senders={newSenders} />
      </Field>
      {#if type === "transfer"}
        <Field label="Hacia" tip="Una transferencia entre tus cuentas no cuenta como gasto ni como ingreso.">
          <AccountSelect bind:value={toAccount} placeholder="Elige…" exclude={account} />
        </Field>
      {:else}
        <Field label="Categoría">
          <Select bind:value={category}>
            <option value="">{type ? "Por palabras clave" : "No cambiarla"}</option>
            {#each type ? cats : store.categories as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </Select>
        </Field>
      {/if}
    </div>

    <Field label="Descripción" tip={"Puedes usar {mes}, {año} y {original}. Vacía, usa la del correo."}>
      <Input bind:value={description} placeholder={"Arriendo {mes}"} />
    </Field>
    {#if description.includes("{")}
      <p class="rule-preview">
        <span class="muted">Quedará:</span>
        <b>{preview}</b>
      </p>
    {/if}

    <Field label="Etiquetas">
      <TagInput bind:value={tags} suggestions={knownTags} />
    </Field>

    <Field label="Notas">
      <Textarea bind:value={notes} rows={2} />
    </Field>

    <div class="form-switches">
      <Switch bind:checked={toNotes} label="Copiar el correo en las notas" />
      {#if rule}<Switch bind:checked={paused} label="En pausa" />{/if}
      {#if !mail && !paused}<Switch bind:checked={applyNow} label="Aplicar a correos ya importados" />{/if}
    </div>

    {#if mail && !usedHere}
      <p class="rule-outcome">
        <Icon name="information-circle" size={16} />
        <span>
          Al guardar, {mail.row.status === "procesado" ? "se actualizará este movimiento" : "se creará este movimiento"}.
          La regla también se aplicará a correos pendientes y nuevos.
        </span>
      </p>
    {:else if usedHere}
      <p class="rule-outcome">
        <Icon name="information-circle" size={16} />
        <span>Cambia solo este movimiento o actualiza la regla y todos sus movimientos.</span>
      </p>
    {/if}
  </div>

  {#snippet footer()}
    {#if rule && !mail}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Borrar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    {#if usedHere}
      <Button loading={busy === "this"} disabled={!!busy} onclick={() => save("this")}>Solo este movimiento</Button>
      <Button variant="secondary" loading={busy === "rule"} disabled={!!busy} onclick={() => save("rule")}>Actualizar regla y movimientos</Button>
    {:else}
      <Button variant="secondary" loading={busy === "rule"} onclick={() => save("rule")}>
        {!mail ? "Guardar" : rule ? "Guardar y crear movimiento" : mail.row.status === "procesado" ? "Crear regla" : "Crear regla y movimiento"}
      </Button>
    {/if}
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Borrar regla"
  message="Los movimientos creados con esta regla no cambiarán."
  busy={!!busy}
  onConfirm={remove}
/>

<style>
  .rule-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }

  .rule-when {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    padding: var(--sp-14);
    border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--accent) 7%, transparent);
  }

  .rule-when-lead {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    margin: 0;
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .when-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 0.8fr);
    gap: var(--sp-12);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .rule-check {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    margin: 0;
    color: var(--warning, var(--text-muted));
    font-size: var(--text-xs);

    &.ok {
      color: var(--success, var(--text-muted));
    }
  }

  .rule-template-note {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .amount-mode {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8) var(--sp-12);
    min-height: 2.25rem;
  }

  .amount-mode :global(.switch) {
    flex: none;
  }

  .amount-value {
    flex: 1;
    min-width: 8rem;
  }

  .rule-preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
    margin: calc(var(--sp-8) * -1) 0 0;
    font-size: var(--text-sm);
  }

  .rule-outcome {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-8);
    margin: 0;
    padding: var(--sp-10) var(--sp-12);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    color: var(--text-secondary);
    font-size: var(--text-sm);

    & :global(svg) {
      flex: none;
      margin-top: 0.1rem;
    }
  }

  .form-switches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-12) var(--sp-20);
  }

  /* Una sola columna, como el formulario del movimiento. */
  .rule-form .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
</style>
