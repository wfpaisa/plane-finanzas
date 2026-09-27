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
  import { highlight, type Piece } from "../../lib/highlight";
  import { TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";
  import { mailMisses, renderDescription } from "../../lib/rules";
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
  let paused = $state(false);
  let applyNow = $state(true);
  let busy = $state<"" | "rule" | "this">("");
  let confirmDelete = $state(false);
  /** Se intentó guardar sin nombre: el campo se marca. */
  let noName = $state(false);
  /** El nombre de antes: mientras la descripción sea igual a él, lo sigue. */
  let lastName = "";

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
      // Las reglas de antes no decían el tipo: toman el del correo, o gasto.
      type = rule?.type || tx?.type || "expense";
      setAmount = rule?.set_amount ?? 0;
      autoAmount = !setAmount;
      account = rule?.account || tx?.account || "";
      toAccount = rule?.to_account || tx?.to_account || "";
      category = rule?.category || tx?.category || "";
      // Una regla nueva describe sus movimientos con su nombre.
      description = rule ? rule.description : name;
      lastName = name;
      // Las etiquetas no se llenan con las que se leyeron: son solo las que se le pongan.
      tags = [...(rule?.tags ?? [])];
      notes = rule?.notes ?? "";
      paused = rule?.paused ?? false;
      applyNow = true;
    });
  });

  // Escribir el nombre llena la descripción, salvo que ya diga otra cosa.
  $effect(() => {
    const n = name;
    untrack(() => {
      if (n === lastName) return;
      if (!description.trim() || description === lastName) description = n;
      lastName = n;
    });
  });

  /** Si ya se procesó con esta regla: se puede cambiar solo su movimiento. */
  const usedHere = $derived(!!mail && !!rule && mail.row.status === "procesado");
  // Descartar no aplica a un correo que ya es movimiento: ese se queda.
  const types = $derived([
    ...TX_TYPES,
    ...(usedHere ? [] : [{ id: "discard" as RuleType, label: "Descartar", icon: "delete-02" }]),
  ]);
  const discarding = $derived(type === "discard");
  const cats = $derived(store.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")));

  // Al cambiar de tipo, una categoría del otro lado deja de valer.
  $effect(() => {
    if (category && !cats.some((c) => c.id === category)) category = "";
  });

  /** Una cuenta creada desde aquí nace con el remitente de la regla. */
  const newSenders = $derived(sender.trim() ? [sender.trim().toLowerCase()] : []);

  /** El valor que trae el correo, sin la regla. */
  const mailAmount = $derived(mail?.suggestion.parsed?.amount ?? 0);
  const mailFields = $derived(mail ? { sender: mail.row.sender, subject: mail.row.subject, text: mail.row.text, amount: mailAmount } : null);
  /** Los campos que el correo no cumple, en rojo. */
  const misses = $derived(mailFields ? mailMisses({ sender, match, amount }, mailFields) : { sender: false, match: false, amount: false });
  // Arriba del correo, su asunto y remitente con lo que la condición toca en
  // ellos, del color del campo que lo pide.
  const mailFrom = $derived(mail ? (/<([^>]+)>/.exec(mail.row.sender)?.[1] ?? mail.row.sender).trim() : "");
  const fromPieces = $derived(highlight(mailFrom, { keys: sender }));
  const subjectPieces = $derived(
    highlight(mail?.row.subject || "Sin asunto", { keys: match, amount: mailAmount, merchant: mail?.suggestion.parsed?.merchant }),
  );
  const date = $derived(mail?.suggestion.tx.date ?? new Date().toISOString().slice(0, 10));
  const original = $derived(mail?.suggestion.parsed?.description || mail?.row.subject || match.split(",")[0]?.trim().toUpperCase() || "GOU PAYMENTS S A");
  const preview = $derived(description.trim() ? renderDescription(description, date, original) : original);

  const title = $derived(usedHere ? "Regla de este movimiento" : rule ? "Editar regla" : "Nueva regla");

  function data() {
    return {
      id: rule?.id,
      name: name.trim(),
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
      paused,
    };
  }

  function check(scope: "rule" | "this"): string {
    if (scope === "rule" && !name.trim()) return "Escribe el nombre de la regla.";
    if (scope === "rule" && !sender.trim() && !match.trim()) return "Escribe un remitente o texto del correo.";
    if (discarding) return "";
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
    noName = scope === "rule" && !name.trim();
    const problem = check(scope);
    if (problem) return notify.fail(new Error(problem));
    busy = scope;
    try {
      const r = await pb.send<{ created: number; updated: number; pending: number; discarded?: number }>("/api/finanzas/inbox/rule", {
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
        if (r.discarded) parts.push(plural(r.discarded, "correo descartado", "correos descartados"));
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

<Modal {open} {onClose} {title} width="modal-panel-width-xl">
  <div class="rule-form">
    <section class="rule-when" aria-label="Cuándo se usa">
      <p class="rule-when-lead"><Icon name="flash" size={14} />Aplicar cuando el correo</p>
      <div class="when-grid">
        <Field label="Viene de" tip="Correo o dominio. Déjalo vacío para aceptar cualquier remitente.">
          <div class="dot-field"><Input bind:value={sender} placeholder="alertas@banco.com" aria-invalid={misses.sender || undefined} /><span class="dot hl-sender" aria-hidden="true"></span></div>
        </Field>
        <Field label="Contiene" tip="Separa varias opciones con comas. Basta con que coincida una.">
          <div class="dot-field"><Input bind:value={match} placeholder="PANADERIA, GOU PAYMENTS" aria-invalid={misses.match || undefined} /><span class="dot hl-rule" aria-hidden="true"></span></div>
        </Field>
        <Field label="Monto" tip="Opcional. Debe coincidir exactamente.">
          <div class="dot-field"><MoneyInput bind:value={amount} placeholder="Cualquiera" invalid={misses.amount} /><span class="dot hl-amount" aria-hidden="true"></span></div>
        </Field>
      </div>
      {#if misses.sender || misses.match || misses.amount}
        <div class="alert warn">
          <Icon name="alert-02" />
          <div>
            <strong>Este correo no cumple la condición</strong>
            Revisa los campos en rojo: lo que escribes debe aparecer en el correo para que la regla funcione.
          </div>
        </div>
      {/if}
      {#if mail}
        <hr class="divider" />
        <div class="rule-mail-head">
          <span class="rule-mail-subject">{#each subjectPieces as p, i (i)}{@render mark(p)}{/each}</span>
          <span class="rule-mail-from">{#each fromPieces as p, i (i)}{@render mark(p, "sender")}{/each}</span>
        </div>
        <MailText
          legend={false}
          text={mail.row.text || mail.row.subject}
          rich={mail.row.rich}
          html={mail.html}
          amount={mailAmount}
          merchant={mail.suggestion.parsed?.merchant}
          keys={match}
          maxHeight="28rem"
        />
      {/if}
      {#if !match.trim() && sender.trim()}
        <p class="rule-check"><Icon name="alert-02" size={14} />La regla se aplicará a <b>todos</b> los correos de este remitente.</p>
      {/if}
    </section>

    <!-- A la derecha: el movimiento que crea. -->
    <div class="rule-then">
      <Field label="Nombre de la regla">
        <Input bind:value={name} placeholder="Panadería, arriendo, pago de la tarjeta…" autofocus={!mail} required aria-invalid={(noName && !name.trim()) || undefined} />
      </Field>

      <Segmented bind:value={type} options={types} full label="Tipo" />

      {#if !discarding}
      <p class="rule-template-note">
        Los correos que coincidan crearán movimientos con estos datos.
      </p>

      <div class="form-grid">
        <!-- Sin Field: su <label> no puede envolver al del interruptor, y su
             estilo de campo estiraría el interruptor. -->
        <div>
          <span class="field-label">Monto</span>
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
              <option value="">Por palabras clave</option>
              {#each cats as c (c.id)}
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
      {/if}

      {#if rule || !mail}
        <div class="form-switches">
          {#if rule}<Switch bind:checked={paused} label="En pausa" />{/if}
          {#if !mail && !paused && !discarding}<Switch bind:checked={applyNow} label="Aplicar a correos ya importados" />{/if}
        </div>
      {/if}

      {#if discarding}
        <p class="rule-outcome">
          <Icon name="information-circle" size={16} />
          <span>
            {#if mail?.row.status === "pendiente"}Al guardar, este correo se descartará.{/if}
            Los correos pendientes y nuevos que cumplan la regla se descartarán sin crear movimientos.
          </span>
        </p>
      {:else if mail && !usedHere}
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
  </div>

  {#snippet footer()}
    {#if rule && !mail}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Eliminar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    {#if usedHere}
      <Button loading={busy === "this"} disabled={!!busy} onclick={() => save("this")}>Solo este movimiento</Button>
      <Button variant="secondary" loading={busy === "rule"} disabled={!!busy} onclick={() => save("rule")}>Actualizar regla y movimientos</Button>
    {:else}
      <Button variant="secondary" loading={busy === "rule"} onclick={() => save("rule")}>
        {#if discarding}
          {!mail || mail.row.status === "procesado" ? (rule ? "Guardar" : "Crear regla") : rule ? "Guardar y descartar" : "Crear regla y descartar"}
        {:else}
          {!mail ? "Guardar" : rule ? "Guardar y crear movimiento" : mail.row.status === "procesado" ? "Crear regla" : "Crear regla y movimiento"}
        {/if}
      </Button>
    {/if}
  {/snippet}
</Modal>

{#snippet mark(p: Piece, as?: string)}{#if p.mark}<mark class="hl-{as ?? p.mark}">{p.text}</mark>{:else}{p.text}{/if}{/snippet}

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Eliminar regla"
  message="Los movimientos creados con esta regla no cambiarán."
  busy={!!busy}
  onConfirm={remove}
/>

<style>
  /* Dos columnas: a la izquierda cuándo se usa (60 %), a la derecha qué crea (40 %). */
  .rule-form {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: var(--sp-20);
    align-items: start;

    @media (max-width: 56rem) {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-16);
    }
  }

  .rule-then {
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

    /* Queda a la vista mientras se baja por la columna de la derecha. */
    @media (min-width: 56.01rem) {
      position: sticky;
      top: 0;
    }
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

  /* Remitente y valor arriba; «Contiene», que suele ser largo, a lo ancho. */
  .when-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--sp-12);

    & > :global(:nth-child(2)) {
      grid-row: 2;
      grid-column: 1 / -1;
    }

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Cada campo de la condición tiene su color: el del resalte que pide en el correo. */
  .rule-when {
    --hl-sender: oklch(0.88 0.08 320);
    --hl-rule: oklch(0.9 0.1 150);
    --hl-amount: oklch(0.92 0.11 90);
    --hl-merchant: oklch(0.9 0.06 250);
  }

  .hl-sender {
    background: var(--hl-sender);
  }

  .hl-rule {
    background: var(--hl-rule);
  }

  .hl-amount {
    background: var(--hl-amount);
  }

  .hl-merchant {
    background: var(--hl-merchant);
  }

  .dot-field {
    position: relative;

    & :global(input) {
      padding-right: 1.9rem;
    }
  }

  .dot {
    position: absolute;
    top: 50%;
    right: 0.7rem;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    box-shadow: 0 0 0 1px oklch(0 0 0 / 0.12);
    translate: 0 -50%;
    pointer-events: none;
    z-index: 1;
  }

  /* Como la cabecera de un correo: asunto arriba, remitente debajo. */
  .rule-mail-head {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    font-size: var(--text-sm);

    & mark {
      padding: 0.05em 0.25em;
      border-radius: 0.25em;
      color: oklch(0.22 0.02 250);
      box-decoration-break: clone;
    }
  }

  .rule-mail-subject {
    color: var(--text-primary);
    font-weight: 600;
  }

  .rule-mail-from {
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .rule-check {
    display: flex;
    align-items: center;
    gap: var(--sp-6);
    margin: 0;
    color: var(--warning, var(--text-muted));
    font-size: var(--text-xs);
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
