<!--
  La bandeja: los correos del banco que esperan una decisión. Nada se vuelve
  movimiento sin que la persona lo diga, salvo lo que ya cubre una regla que
  ella misma creó. Ver pb_hooks/lib/inbox.js.
-->
<script lang="ts">
  import InboxMail from "../components/app/InboxMail.svelte";
  import Money from "../components/app/Money.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, ConfirmDialog, EmptyState } from "../components/ui";
  import Tag from "../components/ui/Tag.svelte";
  import { dateShort } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { pb } from "../lib/pb.svelte";
  import { go, route } from "../lib/router.svelte";
  import { ruleLabel } from "../lib/rules";
  import { reload, store, touchTransactions } from "../lib/store.svelte";
  import type { InboxRow, SyncResult } from "../lib/types";

  const PAGE = 50;
  // Para la lista basta lo de arriba del correo; el texto se pide al abrirlo.
  const FIELDS = "id,external_id,source,sender,subject,date,parsed,status,rule,expand.rule.name,expand.rule.match,expand.rule.sender";

  let tab = $state<"pendiente" | "procesado">("pendiente");
  let rows = $state<InboxRow[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let syncing = $state(false);
  let openId = $state<string | null>(null);
  let confirmAgain = $state(false);

  async function load(more = false) {
    try {
      const page = more ? Math.floor(rows.length / PAGE) + 1 : 1;
      const r = await pb.collection("inbox").getList<InboxRow>(page, PAGE, {
        filter: `status = "${tab}"`,
        sort: "-date,-created",
        expand: "rule",
        fields: FIELDS,
      });
      rows = more ? [...rows, ...r.items] : r.items;
      total = r.totalItems;
    } catch (err) {
      notify.fail(err);
    } finally {
      loading = false;
    }
  }

  // Cada cambio en la bandeja (tiempo real) mueve el contador: se recarga.
  $effect(() => {
    void tab;
    void store.inboxPending;
    void store.txVersion;
    void load();
  });

  // Llegar con ?correo=ID (desde un movimiento) abre ese correo.
  $effect(() => {
    const ext = route.query.get("correo");
    if (!ext) return;
    pb.collection("inbox")
      .getFirstListItem<InboxRow>(pb.filter("external_id = {:e}", { e: ext }), { fields: "id,status" })
      .then((r) => {
        tab = r.status;
        openId = r.id;
      })
      .catch(() => notify.fail(new Error("El correo ya no está en Correos.")))
      .finally(() => go("/correos"));
  });

  /** Con `again`, trae de nuevo los de 90 días atrás que no tienen movimiento. */
  async function sync(again = false) {
    syncing = true;
    try {
      const r = await pb.send<SyncResult>("/api/finanzas/gmail/sync", { method: "POST", body: { again } });
      if (r.created) touchTransactions();
      await reload("gmail");
      const fresh = r.created + r.pending;
      notify.done(fresh ? `${fresh} ${again ? "de vuelta" : "nuevos"}: ${r.created} procesados y ${r.pending} pendientes.` : "No hay correos nuevos.");
      if (again) {
        confirmAgain = false;
        tab = "pendiente";
      }
    } catch (err) {
      notify.fail(err);
    } finally {
      syncing = false;
    }
  }

  /** "Banco <alertas@banco.com>" -> "alertas@banco.com"; sin remitente, texto pegado. */
  function senderAddress(from: string): string {
    const m = /<([^>]+)>/.exec(from);
    return (m ? m[1] : from).trim() || "Texto pegado";
  }

</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Correos</h1>
      <p>Revisa los correos del banco y decide qué hacer. Se filtran según los remitentes configurados en tus cuentas.</p>
    </div>
    <div class="page-actions">
      {#if store.gmail?.email}
        <Button variant="ghost" disabled={syncing} onclick={() => (confirmAgain = true)}><Icon name="mail-download-01" />Traer de nuevo</Button>
        <Button variant="secondary" loading={syncing && !confirmAgain} onclick={() => sync()}><Icon name="refresh" />Revisar Gmail</Button>
      {:else}
        <Button variant="secondary" onclick={() => go("/ajustes", { seccion: "gmail" })}><Icon name="link-01" />Conectar Gmail</Button>
      {/if}
    </div>
  </header>

  <div class="chips inbox-tabs" role="tablist">
    <button type="button" role="tab" aria-selected={tab === "pendiente"} class="chip" class:active={tab === "pendiente"} onclick={() => (tab = "pendiente")}>
      <Icon name="mail-01" />Por decidir{#if store.inboxPending}<span class="inbox-count">{store.inboxPending}</span>{/if}
    </button>
    <button type="button" role="tab" aria-selected={tab === "procesado"} class="chip" class:active={tab === "procesado"} onclick={() => (tab = "procesado")}>
      <Icon name="task-done-01" />Procesados
    </button>
  </div>

  {#if !loading && !rows.length}
    <div class="card">
      <EmptyState
        title={tab === "pendiente" ? "No hay correos por decidir" : "No hay correos procesados"}
        description={tab === "pendiente"
          ? "Los correos que necesiten revisión aparecerán aquí."
          : "Aquí aparecerán los correos convertidos en movimientos."}
      />
    </div>
  {:else}
    <div class="card inbox-card">
      <ul class="inbox-list">
        {#each rows as r (r.id)}
          <li>
            <button type="button" class="inbox-row" onclick={() => (openId = r.id)}>
              <span class="inbox-date">{dateShort(r.date.slice(0, 10))}</span>
              <span class="inbox-main">
                <span class="inbox-title">{r.subject || "Sin asunto"}</span>
                <span class="inbox-sender">{senderAddress(r.sender)}</span>
              </span>
              {#if r.status === "procesado"}
                {#if r.rule}
                  <Tag tone="tint-1"><Icon name="flash" size={11} />{ruleLabel(r.expand?.rule)}</Tag>
                {:else}
                  <Tag tone="off">a mano</Tag>
                {/if}
              {/if}
              <span class="inbox-amount">
                {#if r.parsed?.amount}<Money value={r.parsed.amount} tone={r.parsed.type} />{:else}<span class="muted small">sin valor</span>{/if}
              </span>
              <Icon name="arrow-right-01" size={14} />
            </button>
          </li>
        {/each}
      </ul>
      {#if rows.length < total}
        <div class="inbox-more"><Button size="sm" variant="ghost" onclick={() => load(true)}>Ver más ({total - rows.length})</Button></div>
      {/if}
    </div>
  {/if}
</div>

<InboxMail id={openId} onClose={() => (openId = null)} onChanged={() => void load()} />

<ConfirmDialog
  open={confirmAgain}
  onClose={() => (confirmAgain = false)}
  title="Traer de nuevo los correos"
  message="Se vuelven a leer de Gmail los correos de tus remitentes de los últimos 90 días que no tienen movimiento, incluidos los que quitaste de la bandeja o cuyo movimiento eliminaste. Quedan en Por decidir, salvo los que reconozca una regla. Los movimientos que ya tienes no cambian."
  confirmLabel="Traer de nuevo"
  confirmVariant="secondary"
  busy={syncing}
  onConfirm={() => sync(true)}
/>

<style>
  .inbox-tabs {
    margin-bottom: var(--sp-16);
  }

  .inbox-count {
    min-width: 1.25rem;
    padding: 0 0.35rem;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .inbox-card {
    padding: 0;
    overflow: hidden;
  }

  .inbox-list {
    margin: 0;
    padding: 0;
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }
  }

  .inbox-row {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    padding: var(--sp-12) var(--sp-16);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }
  }

  .inbox-date {
    flex: none;
    width: 3.5rem;
    font-variant-numeric: tabular-nums;
  }

  .inbox-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .inbox-title {
    color: var(--text-primary);
    font-weight: 600;
  }

  .inbox-title,
  .inbox-sender {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .inbox-amount {
    flex: none;
    font-weight: 600;
    text-align: right;
  }

  .inbox-more {
    display: flex;
    justify-content: center;
    padding: var(--sp-8);
    border-top: 1px solid var(--border);
  }

  @media (max-width: 40rem) {
    .inbox-row :global(.tag) {
      display: none;
    }
  }
</style>
