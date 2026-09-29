<!--
  La pestaña Gmail de Ajustes: conectar Gmail, decir qué remitentes son
  transaccionales y las reglas. Lo que llega va a la bandeja (`#/correos`).
-->
<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { Button, Field, Switch } from "../components/ui";
  import { notify } from "../lib/notify.svelte";
  import { pb } from "../lib/pb.svelte";
  import { go, route } from "../lib/router.svelte";
  import { reload, store, touchTransactions } from "../lib/store.svelte";
  import type { SyncResult } from "../lib/types";
  import MerchantsCard from "../components/app/MerchantsCard.svelte";
  import RulesCard from "../components/app/RulesCard.svelte";
  import TagInput from "../components/app/TagInput.svelte";

  let config = $state<{ configured: boolean; redirectUri: string; defaultSenders: string[] } | null>(null);
  let syncing = $state(false);
  let connecting = $state(false);
  let senders = $state<string[]>([]);

  const g = $derived(store.gmail);
  const connected = $derived(!!g?.email);

  $effect(() => {
    pb.send("/api/finanzas/gmail/config", {})
      .then((c) => (config = c))
      .catch(() => {});
  });

  $effect(() => {
    senders = [...(g?.senders ?? [])];
  });

  // Vuelta de Google.
  $effect(() => {
    const r = route.query.get("gmail");
    if (!r) return;
    if (r === "ok") notify.done("Gmail conectado. Ya puedes sincronizar.");
    else notify.fail(new Error(r === "cancelado" ? "Cancelaste la conexión con Gmail." : "No se pudo conectar Gmail. Intenta de nuevo."));
    void reload("gmail");
    go("/ajustes", { seccion: "gmail" });
  });

  async function connect() {
    connecting = true;
    try {
      const { url } = await pb.send<{ url: string }>("/api/finanzas/gmail/connect", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      notify.fail(err);
      connecting = false;
    }
  }

  async function sync() {
    syncing = true;
    try {
      const r = await pb.send<SyncResult>("/api/finanzas/gmail/sync", { method: "POST" });
      if (r.created) touchTransactions();
      await reload("gmail");
      const fresh = r.created + r.pending;
      notify.done(
        fresh
          ? `${fresh} correos nuevos: ${r.created} movimientos creados por reglas y ${r.pending} esperan en Correos.`
          : "No hay correos nuevos.",
      );
    } catch (err) {
      notify.fail(err);
    } finally {
      syncing = false;
    }
  }

  async function saveGmail(patch: Record<string, unknown>) {
    if (!g) return;
    try {
      await pb.collection("gmail_connections").update(g.id, patch);
      await reload("gmail");
      return true;
    } catch (err) {
      notify.fail(err);
      return false;
    }
  }

  // Cada cambio de la lista se guarda solo, en fila: si se agregan dos
  // seguidos, el segundo no pisa al primero con una lista vieja.
  let saving: Promise<unknown> = Promise.resolve();
  function setSenders(next: string[]) {
    senders = next;
    saving = saving.then(async () => {
      if (await saveGmail({ senders: next })) notify.done("Remitentes guardados. La próxima lectura revisa los últimos 90 días.");
    });
  }

  async function disconnect() {
    if (!g) return;
    try {
      await pb.collection("gmail_connections").delete(g.id);
      await reload("gmail");
    } catch (err) {
      notify.fail(err);
    }
  }

  /** Los remitentes de las cuentas: también se leen. */
  const accountSenders = $derived([...new Set(store.activeAccounts.flatMap((a) => a.senders ?? []))]);
  const noSenders = $derived(store.activeAccounts.filter((a) => !a.senders?.length));
</script>

<div class="stack">
  <div class="card gmail-card">
    <div class="card-head">
      <div class="gmail-title">
        <span class="gmail-logo"><Icon name="mail-01" size={22} /></span>
        <div>
          <h3 class="card-title">Gmail</h3>
          <p class="card-sub">
            {#if connected}Conectado como <b>{g?.email}</b>{:else}Lee los correos de tu banco y los lleva a Correos, donde decides qué hacer con cada uno.{/if}
          </p>
        </div>
      </div>
      <div class="card-head-actions">
        {#if connected}
          <Button variant="secondary" loading={syncing} onclick={sync}><Icon name="refresh" />Sincronizar ahora</Button>
        {:else}
          <Button variant="secondary" loading={connecting} disabled={config?.configured === false} onclick={connect}>
            <Icon name="link-01" />Conectar Gmail
          </Button>
        {/if}
      </div>
    </div>
    <div class="card-body stack">
      {#if config && !config.configured}
        <div class="setup">
          <p><b>Falta configurar el acceso a Google en el servidor</b> (una sola vez, sirve para todos los usuarios):</p>
          <ol>
            <li>En <a class="link" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a> crea un proyecto y activa la <b>Gmail API</b>.</li>
            <li>En <i>Pantalla de consentimiento OAuth</i> elige "Externo" y agrega tu correo (y el de cada usuario) como usuario de prueba.</li>
            <li>En <i>Credenciales</i> crea un <b>ID de cliente OAuth</b> tipo "Aplicación web" con este URI de redirección:<br /><code>{config.redirectUri}</code></li>
            <li>Pon <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en el archivo <code>.env</code> y reinicia con <code>bun run pb</code>.</li>
          </ol>
        </div>
      {/if}

      {#if connected && g}
        <div class="gmail-status">
          <div class="stat">
            <span class="s-label">Última lectura</span>
            <span class="s-foot">{g.last_sync ? new Date(g.last_sync.replace(" ", "T")).toLocaleString("es-CO") : "Nunca"}</span>
          </div>
          {#if g.last_result}
            <div class="stat"><span class="s-label">Correos leídos</span><span class="s-val">{g.last_result.read}</span></div>
            <div class="stat"><span class="s-label">Creados por reglas</span><span class="s-val">{g.last_result.created}</span></div>
          {/if}
          <div class="stat">
            <span class="s-label">Esperan en Correos</span>
            <a class="s-val link" href="#/correos">{store.inboxPending}</a>
          </div>
        </div>
        {#if g.last_error}
          <div class="alert danger"><Icon name="alert-02" /><div>{g.last_error}</div></div>
        {/if}
        <Field
          label="Remitentes transaccionales"
          hint="Solo se leen los correos de estos remitentes: escribe el correo completo o una parte (el dominio o el nombre del banco) y pulsa Enter. Se guarda al instante. La lectura se hace cada 30 minutos."
        >
          <TagInput bind:value={() => senders, setSenders} prefix="" placeholder="alertas@banco.com, banco.com…" suggestions={config?.defaultSenders ?? []} />
        </Field>
        {#if accountSenders.length}
          <p class="muted small senders-note">También se leen los de tus cuentas: {accountSenders.join(", ")}.</p>
        {/if}
        <div class="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onclick={() => setSenders([...(config?.defaultSenders ?? [])])}>Usar los bancos comunes</Button>
          <span class="flex-1"></span>
          <Switch checked={g.paused} label="Pausar" onchange={(v) => saveGmail({ paused: v })} />
          <Button size="sm" variant="ghost" class="btn-danger" onclick={disconnect}><Icon name="unlink-01" />Desconectar</Button>
        </div>
      {/if}

      {#if noSenders.length}
        <div class="alert warn">
          <Icon name="alert-02" />
          <div>
            Para que se proponga la cuenta de cada correo, agrega sus remitentes en <a class="link" href="#/cuentas">Cuentas</a>. Faltan en:
            {noSenders.map((a) => a.name).join(", ")}.
          </div>
        </div>
      {/if}
    </div>
  </div>

  <RulesCard initialMatch={route.query.get("regla") ?? ""} />

  <MerchantsCard />
</div>

<style>
  .gmail-title {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
  }

  .gmail-logo {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, #ea4335, #fbbc05 45%, #34a853 75%, #4285f4);
    color: white;
  }

  .senders-note {
    margin: calc(var(--sp-8) * -1) 0 0;
  }

  .gmail-status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-12) var(--sp-40);
  }

  .setup {
    padding: var(--sp-14) var(--sp-16);
    border-radius: var(--radius-md);
    background: var(--bg-field);
    color: var(--text-secondary);

    & p {
      margin: 0 0 var(--sp-8);
    }

    & ol {
      margin: 0;
      padding-left: 1.2rem;
      display: flex;
      flex-direction: column;
      gap: var(--sp-6);
    }

    & code {
      padding: 0.05rem 0.3rem;
      border-radius: 0.25rem;
      background: var(--bg-level2);
      font-family: var(--font-mono);
      font-size: 0.8em;
      word-break: break-all;
    }
  }
</style>
