<!--
  Un correo de la bandeja, abierto: su contenido, lo que se leyó de él y la
  decisión. Pendiente: crear el movimiento, crear una regla o descartarlo.
  Procesado: su movimiento y la regla que se usó, para verla o cambiarla.
-->
<script lang="ts">
  import { dateLong } from "../../lib/format";
  import { accountTypeIcon, txTypeLabel } from "../../lib/labels";
  import { hasRemote } from "../../lib/mailHtml";
  import { notify } from "../../lib/notify.svelte";
  import { colorOf } from "../../lib/palettes";
  import { pb } from "../../lib/pb.svelte";
  import { accountsBySender, ruleLabel } from "../../lib/rules";
  import { store } from "../../lib/store.svelte";
  import { categoryTags } from "../../lib/tags";
  import type { InboxRow, Suggestion, Transaction } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, Loading, Modal } from "../ui";
  import MailText from "./MailText.svelte";
  import Money from "./Money.svelte";
  import RuleForm from "./RuleForm.svelte";
  import TransactionForm from "./TransactionForm.svelte";

  let { id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void } = $props();

  let row = $state<InboxRow | null>(null);
  let suggestion = $state<Suggestion | null>(null);
  let tx = $state<Transaction | null>(null);
  /** El HTML original, si es de Gmail y lo trae ("" si no). */
  let html = $state("");
  /** Cargar las imágenes de afuera del correo (se piden aparte: pueden rastrear). */
  let images = $state(false);
  let txOpen = $state(false);
  /** El movimiento ya creado, abierto encima del correo; al cerrarlo se vuelve aquí. */
  let editOpen = $state(false);
  let ruleOpen = $state(false);
  /** Al abrir la regla desde un pendiente: completar la que ya coincide, o una nueva. */
  let completeRule = $state(false);
  let busy = $state(false);

  async function load(target: string) {
    try {
      const [r, s, h] = await Promise.all([
        pb.collection("inbox").getOne<InboxRow>(target, { expand: "rule" }),
        pb.send<Suggestion>("/api/finanzas/inbox/suggest", { method: "POST", body: { id: target } }),
        // Si Gmail no responde, queda el texto: no es motivo para no abrirlo.
        pb.send<{ html: string }>(`/api/finanzas/inbox/${target}/html`, { requestKey: null }).catch(() => ({ html: "" })),
      ]);
      if (target !== id) return;
      row = r;
      suggestion = s;
      html = h.html;
      tx = s.transaction ? await pb.collection("transactions").getOne<Transaction>(s.transaction, { expand: "rule" }) : null;
    } catch (err) {
      notify.fail(err);
      onClose();
    }
  }

  $effect(() => {
    row = null;
    suggestion = null;
    tx = null;
    html = "";
    images = false;
    completeRule = false;
    if (id) void load(id);
  });

  const pending = $derived(row?.status === "pendiente");
  /** La cuenta que reconoció el correo: la de su movimiento o la que propone. */
  const account = $derived(store.account(tx?.account || suggestion?.tx.account || ""));
  /** Las otras cuentas con el mismo remitente: se ven juntas en el avatar. */
  const others = $derived(accountsBySender(row?.sender ?? "", store.activeAccounts).filter((a) => a.id !== account?.id));
  /** El avatar: la cuenta primero, encima; cada una debajo de la anterior. */
  const stack = $derived(account ? [account, ...others] : others);
  const remote = $derived(!!html && hasRemote(html));
  /** «Banco Principal <alertas@banco.com>» en nombre y dirección. */
  const from = $derived.by(() => {
    const raw = (row?.sender ?? "").trim();
    if (!raw) return { name: row?.source === "texto" ? "Texto pegado" : "Sin remitente", address: "" };
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
    if (m && m[1]) return { name: m[1], address: m[2] };
    return { name: m ? m[2] : raw, address: "" };
  });
  const raw = $derived(row ? `${row.subject}\n${row.text}`.trim() : "");
  const knownTags = $derived([...new Set(["fijo", "revisar", "viaje", "trabajo", "casa", "salud", "regalo", ...categoryTags()])]);

  async function discard() {
    if (!row) return;
    busy = true;
    try {
      await pb.collection("inbox").delete(row.id);
      notify.done(pending ? "Correo descartado." : "Correo quitado.");
      onChanged();
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  /** Lo que le falta al movimiento que propone la regla (como en lib/inbox.js). */
  function missingOf(s: Suggestion): string {
    if (!(s.tx.amount > 0)) return "el valor";
    if (!s.tx.account) return "la cuenta";
    if (s.tx.type === "transfer" && !s.tx.to_account) return "la cuenta de destino";
    return "algo";
  }

  /** Al volver del movimiento se relee el correo: pudo cambiar o borrarse. */
  function closeEdit() {
    editOpen = false;
    if (id) void load(id);
    onChanged();
  }

  function done() {
    onChanged();
    onClose();
  }
</script>

<Modal open={!!id && !txOpen && !editOpen && !ruleOpen} {onClose} title={row?.subject || "Correo"} icon="mail-01" width="modal-panel-width-lg">
  {#if !row || !suggestion}
    <Loading label="Abriendo el correo" />
  {:else}
    <div class="mail">
      <article class="mail-card" aria-label="Correo">
        <header class="mail-head">
          {#if account || others.length}
            <span class="mail-avatars">
              {#each stack as a, i (a.id)}
                {@const tip = `Cuenta: ${a.name}`}
                <span class="mail-avatar" style:--av={colorOf(a.palette)} style:z-index={stack.length - i} data-tip={tip} role="img" aria-label={tip}>
                  <Icon name={a.icon || accountTypeIcon(a.type)} size={16} />
                </span>
              {/each}
            </span>
          {:else}
            <span class="mail-avatar" data-tip="Ninguna cuenta reconoce este remitente" role="img" aria-label="Sin cuenta">
              {from.name.charAt(0).toUpperCase() || "?"}
            </span>
          {/if}
          <div class="mail-from">
            <b>{from.name}</b>
            {#if from.address}<span>{from.address}</span>{/if}
          </div>
          <time datetime={row.date.slice(0, 10)}><Icon name="calendar-03" size={13} />{dateLong(row.date.slice(0, 10))}</time>
          {#if remote}
            <button
              type="button"
              class="mail-tool"
              aria-pressed={images}
              aria-label={images ? "Ocultar imágenes" : "Mostrar imágenes"}
              data-tip={images ? "Ocultar imágenes" : "Mostrar imágenes"}
              onclick={() => (images = !images)}
            >
              <Icon name={images ? "image-not-found-01" : "image-01"} size={16} />
            </button>
          {/if}
        </header>
        <MailText
          text={row.text || row.subject}
          rich={row.rich}
          {html}
          amount={suggestion.parsed?.amount}
          merchant={suggestion.parsed?.merchant}
          keys={suggestion.rule?.match ?? ""}
          maxHeight="24rem"
          legend={false}
          framed={false}
          bind:images
        />
      </article>

      {#if pending && suggestion.rule}
        <p class="rule-hint">
          <Icon name="flash" size={14} />
          <span>La regla <b>«{ruleLabel(suggestion.rule)}»</b> necesita {missingOf(suggestion)}.</span>
          <Button size="sm" variant="ghost" onclick={() => { completeRule = true; ruleOpen = true; }}>Completar la regla</Button>
        </p>
      {/if}

      {#if pending}
        <section class="decide" aria-label="Qué hacer con este correo">
          <p class="eyebrow">Elige una acción</p>
          <div class="decide-grid">
            <button type="button" class="decide-option" onclick={() => (txOpen = true)}>
              <Icon name="add-01" size={20} />
              <b>Crear movimiento</b>
              <span>Revisa los datos y guarda.</span>
            </button>
            <button type="button" class="decide-option" onclick={() => { completeRule = false; ruleOpen = true; }}>
              <Icon name="flash" size={20} />
              <b>Crear regla</b>
              <span>Procesa correos similares automáticamente.</span>
            </button>
            <button type="button" class="decide-option danger" disabled={busy} onclick={discard}>
              <Icon name="delete-02" size={20} />
              <b>Descartar</b>
              <span>Quítalo de la bandeja.</span>
            </button>
          </div>
        </section>
      {:else}
        <section class="outcome" aria-label="Qué se hizo">
          <div class="outcome-line">
            {#if tx}
              <Icon name="checkmark-circle-02" size={16} />
              <span>
                Movimiento: <b>{tx.description || txTypeLabel(tx.type)}</b> ·
                <Money value={tx.amount} tone={tx.type} /> ·
                {store.account(tx.account)?.name ?? "—"}{#if tx.to_account} → {store.account(tx.to_account)?.name ?? "—"}{/if}
              </span>
              <Button size="sm" variant="ghost" onclick={() => (editOpen = true)}>Ver movimiento</Button>
            {:else}
              <Icon name="alert-02" size={16} />
              <span>Este movimiento fue eliminado.</span>
              <Button size="sm" variant="ghost" onclick={() => (txOpen = true)}>Volver a crear</Button>
            {/if}
          </div>
          <div class="outcome-line">
            <Icon name="flash" size={16} />
            {#if suggestion.rule && row.rule}
              <span>Se usó la regla <b>«{ruleLabel(suggestion.rule)}»</b>.</span>
              <Button size="sm" variant="ghost" onclick={() => (ruleOpen = true)}>Ver regla</Button>
            {:else}
              <span>Se creó a mano, sin regla.</span>
              <Button size="sm" variant="ghost" onclick={() => (ruleOpen = true)}>Crear regla</Button>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {#if row && !pending}
      <Button variant="ghost" disabled={busy} onclick={discard}>Quitar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cerrar</Button>
  {/snippet}
</Modal>

{#if row && suggestion}
  <TransactionForm
    open={txOpen}
    draft={suggestion.tx}
    origin={{ external_id: row.external_id, raw, source: row.source, sender: suggestion.pattern.sender }}
    onClose={() => (txOpen = false)}
    onSaved={done}
    {knownTags}
  />
  {#if tx}
    <TransactionForm open={editOpen} {tx} onClose={closeEdit} {knownTags} />
  {/if}
  <RuleForm
    open={ruleOpen}
    rule={row.rule || completeRule ? suggestion.rule : null}
    mail={{ row, suggestion, html }}
    onClose={() => (ruleOpen = false)}
    onSaved={done}
    {knownTags}
  />
{/if}

<style>
  .mail {
    display: flex;
    flex-direction: column;
    gap: var(--sp-14);
  }

  /* El correo como en una bandeja: remitente y fecha arriba, el cuerpo debajo. */
  .mail-card {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: oklch(1 0 0);
  }

  .mail-head {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: var(--sp-12) var(--sp-16);
    border-bottom: 1px solid oklch(0.9 0 0);
    color: oklch(0.28 0.01 250);
    font-size: var(--text-sm);

    & time {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--sp-4);
      color: oklch(0.5 0.01 250);
      font-size: var(--text-xs);
    }
  }

  .mail-avatar {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: oklch(0.9 0.05 250);
    color: oklch(0.35 0.08 250);
    font-weight: 600;

    /* Con cuenta: su color, como en Cuentas. */
    &[style] {
      background: var(--av);
      color: oklch(1 0 0);
    }
  }

  /* Varias cuentas con el mismo remitente: apiladas, la que se usó encima. */
  .mail-avatars {
    display: flex;
    flex-shrink: 0;

    & .mail-avatar {
      position: relative;
      box-shadow: 0 0 0 2px oklch(1 0 0);
      transition: margin-left 0.18s ease;
    }

    /* Comprimidos: el 1.º a la izquierda y los demás asoman a su derecha. */
    & .mail-avatar + .mail-avatar {
      margin-left: -1.625rem;
    }

    /* Al pasar el mouse se abren para poder señalar cada uno. */
    &:hover .mail-avatar + .mail-avatar {
      margin-left: -0.5rem;
    }

    /* El señalado sale al frente (el orden normal va en línea). */
    & .mail-avatar:hover {
      z-index: 99 !important;
    }
  }


  /* Botón sobre el papel blanco: claro en los dos temas. */
  .mail-tool {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: oklch(0.45 0.01 250);
    cursor: pointer;

    &:hover,
    &[aria-pressed="true"] {
      background: oklch(0.94 0 0);
      color: oklch(0.25 0.01 250);
    }
  }

  .mail-from {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;

    & b,
    & span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    & span {
      color: oklch(0.5 0.01 250);
      font-size: var(--text-xs);
    }
  }

  .rule-hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6) var(--sp-8);
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);

    & > span {
      flex: 1;
      min-width: 12rem;
    }
  }

  .decide {
    margin-top: var(--sp-10);
  }

  .decide .eyebrow {
    margin: 0 0 var(--sp-14);
  }

  .decide-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-10);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .decide-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-4);
    padding: var(--sp-12) var(--sp-14);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-level2, transparent);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;

    & :global(svg) {
      color: var(--accent);
    }

    & span {
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    &:hover {
      border-color: var(--accent);
      background: var(--bg-hover);
    }

    &.danger :global(svg) {
      color: var(--danger);
    }

    &.danger:hover {
      border-color: var(--danger);
    }
  }

  .outcome {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-14);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    font-size: var(--text-sm);
  }

  .outcome-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6) var(--sp-8);

    & > span {
      flex: 1;
      min-width: 12rem;
    }
  }
</style>
