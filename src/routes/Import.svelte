<!--
  Importar: conectar Gmail para que las notificaciones del banco se vuelvan
  transacciones solas, o pegar texto (SMS, correos copiados) a mano.
-->
<script lang="ts">
  import Money from "../components/app/Money.svelte";
  import Icon from "../components/Icon.svelte";
  import { Button, Field, Select, Switch, Textarea } from "../components/ui";
  import Tag from "../components/ui/Tag.svelte";
  import { dateShort } from "../lib/format";
  import { notify } from "../lib/notify.svelte";
  import { pb } from "../lib/pb.svelte";
  import { go, route } from "../lib/router.svelte";
  import { reload, store, touchTransactions } from "../lib/store.svelte";
  import { applyPlan, planFromCsv, type CsvPlan } from "../lib/csvImport";
  import { session } from "../lib/pb.svelte";
  import type { ImportItem, ImportResult } from "../lib/types";

  let config = $state<{ configured: boolean; redirectUri: string; defaultQuery: string } | null>(null);
  let syncing = $state(false);
  let connecting = $state(false);
  let query = $state("");
  let lastSync = $state<ImportResult | null>(null);

  let text = $state("");
  let account = $state("");
  let preview = $state<ImportResult | null>(null);
  let busy = $state(false);

  const g = $derived(store.gmail);
  const connected = $derived(!!g?.email);

  $effect(() => {
    pb.send("/api/finanzas/gmail/config", {})
      .then((c) => (config = c))
      .catch(() => {});
  });

  $effect(() => {
    query = g?.query ?? "";
  });

  // Vuelta de Google.
  $effect(() => {
    const r = route.query.get("gmail");
    if (!r) return;
    if (r === "ok") notify.done("Gmail conectado. Ya puedes sincronizar.");
    else notify.fail(new Error(r === "cancelado" ? "Cancelaste la conexión con Gmail." : "No se pudo conectar Gmail. Intenta de nuevo."));
    void reload("gmail");
    go("/importar");
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
      lastSync = await pb.send<ImportResult>("/api/finanzas/gmail/sync", { method: "POST" });
      touchTransactions();
      await reload("gmail");
      notify.done(`${lastSync.created} movimientos nuevos de ${lastSync.read ?? 0} correos.`);
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
    } catch (err) {
      notify.fail(err);
    }
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

  async function runText(dry: boolean) {
    if (!text.trim()) return;
    busy = true;
    try {
      const r = await pb.send<ImportResult>("/api/finanzas/import-text", {
        method: "POST",
        body: { text, dry, account },
      });
      if (dry) preview = r;
      else {
        preview = r;
        touchTransactions();
        notify.done(`${r.created} movimientos importados.`);
        if (r.created) text = "";
      }
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  const statusTone = (s: ImportItem["status"]) =>
    s === "creado" ? "tag-success" : s === "nuevo" ? "tint-1" : s === "duplicado" ? "off" : "tag-warning";

  let csvPlan = $state<CsvPlan | null>(null);
  let csvName = $state("");
  let csvBusy = $state(false);
  let csvProgress = $state("");

  async function readCsv(file: File | undefined) {
    if (!file) return;
    try {
      csvPlan = planFromCsv(await file.text());
      csvName = file.name;
    } catch (err) {
      notify.fail(err);
    }
  }

  async function importCsv() {
    if (!csvPlan) return;
    csvBusy = true;
    try {
      const r = await applyPlan(pb, session.id, csvPlan, (d, t) => (csvProgress = `${d}/${t}`));
      await reload();
      touchTransactions();
      notify.done(`${r.created} movimientos, ${r.accountsCreated} cuentas y ${r.categoriesCreated} categorías nuevas. ${r.duplicated} ya estaban.`);
      csvPlan = null;
    } catch (err) {
      notify.fail(err);
    } finally {
      csvBusy = false;
      csvProgress = "";
    }
  }

  const noKeys = $derived(store.activeAccounts.filter((a) => !a.match_keys?.trim()));
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Importar</h1>
      <p>Que los movimientos lleguen solos, sin escribirlos uno por uno.</p>
    </div>
  </header>

  <div class="stack">
    <div class="card gmail-card">
      <div class="card-head">
        <div class="gmail-title">
          <span class="gmail-logo"><Icon name="mail-01" size={22} /></span>
          <div>
            <h3 class="card-title">Gmail</h3>
            <p class="card-sub">
              {#if connected}Conectado como <b>{g?.email}</b>{:else}Lee las notificaciones de tu banco y las convierte en movimientos organizados por categoría.{/if}
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
              <div class="stat"><span class="s-label">Nuevas</span><span class="s-val">{g.last_result.created}</span></div>
              <div class="stat"><span class="s-label">Ya estaban</span><span class="s-val">{g.last_result.skipped}</span></div>
            {/if}
          </div>
          {#if g.last_error}
            <div class="alert danger"><Icon name="alert-02" /><div>{g.last_error}</div></div>
          {/if}
          <Field label="Correos que se deben leer" hint="Indica los remitentes de las entidades financieras. La búsqueda se ejecuta cada 30 minutos.">
            <Textarea bind:value={query} rows={2} />
          </Field>
          <div class="flex flex-wrap items-center gap-3">
            <Button size="sm" onclick={() => saveGmail({ query })}>Guardar búsqueda</Button>
            <Button size="sm" variant="ghost" onclick={() => (query = config?.defaultQuery ?? "")}>Restaurar</Button>
            <span class="flex-1"></span>
            <Switch checked={g.paused} label="Pausar" onchange={(v) => saveGmail({ paused: v })} />
            <Button size="sm" variant="ghost" class="btn-danger" onclick={disconnect}><Icon name="unlink-01" />Desconectar</Button>
          </div>
        {/if}

        {#if noKeys.length}
          <div class="alert warn">
            <Icon name="alert-02" />
            <div>
              Para identificar la cuenta correspondiente a cada correo, agrega los <b>últimos 4 dígitos</b> o el nombre de la entidad en
              <a class="link" href="#/cuentas">Cuentas</a>. Falta esta información en: {noKeys.map((a) => a.name).join(", ")}.
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if lastSync?.items?.length}
      {@render results(lastSync, "Resultado de la sincronización")}
    {/if}

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Pegar notificaciones</h3>
          <p class="card-sub">SMS del banco, correos copiados o un listado. Una notificación por párrafo o por línea.</p>
        </div>
      </div>
      <div class="card-body stack">
        <Textarea
          bind:value={text}
          rows={6}
          placeholder={"Bancolombia le informa Compra por $45.900,00 en EXITO LAURELES 14:32. 22/09/2026 T.Cred *1234.\n\nBancolombia: Recibiste una transferencia por $350.000 de ANA en tu cuenta **1234"}
        />
        <div class="flex flex-wrap items-end gap-3">
          <div class="paste-account">
            <Field label="Cuenta predeterminada para mensajes no identificados">
              <Select bind:value={account}>
                <option value="">Primera cuenta disponible</option>
                {#each store.activeAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
              </Select>
            </Field>
          </div>
          <span class="flex-1"></span>
          <Button loading={busy} onclick={() => runText(true)} disabled={!text.trim()}><Icon name="view" />Vista previa</Button>
          <Button variant="secondary" loading={busy} onclick={() => runText(false)} disabled={!text.trim()}>
            <Icon name="database-import" />Importar
          </Button>
        </div>
      </div>
    </div>

    {#if preview}
      {@render results(preview, preview.created ? "Importado" : "Vista previa")}
    {/if}

    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Registro contable (CSV)</h3>
          <p class="card-sub">Importa cuentas, categorías y movimientos desde un archivo exportado por tu aplicación anterior. Los movimientos ya importados no se duplican.</p>
        </div>
      </div>
      <div class="card-body stack">
        <label class="dropzone">
          <Icon name="file-spreadsheet" size={20} />
          <span class="dropzone-lead">{csvName || "Elegir archivo .csv"}</span>
          <span class="dropzone-hint">Columnas: Fecha, Cuenta, Categoría, Subcategorías, Nota, COP, Ingreso/Gasto, Descripción</span>
          <input type="file" accept=".csv,text/csv" class="dropzone-input" onchange={(e) => readCsv(e.currentTarget.files?.[0])} />
        </label>
        {#if csvPlan}
          <div class="csv-summary">
            <div class="stat"><span class="s-label">Movimientos</span><span class="s-val">{csvPlan.transactions.length}</span></div>
            <div class="stat"><span class="s-label">Cuentas</span><span class="s-val">{csvPlan.accounts.length}</span></div>
            <div class="stat"><span class="s-label">Categorías</span><span class="s-val">{csvPlan.categories.length}</span></div>
            <div class="stat">
              <span class="s-label">Desde</span>
              <span class="s-val">{dateShort(csvPlan.transactions.at(-1)?.date ?? "")}</span>
            </div>
            <span class="flex-1"></span>
            <Button variant="secondary" loading={csvBusy} onclick={importCsv}>
              <Icon name="database-import" />{csvBusy ? `Importando ${csvProgress}` : "Importar"}
            </Button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

{#snippet results(r: ImportResult, title: string)}
  <div class="card table-card">
    <div class="card-head">
      <div>
        <h3 class="card-title">{title}</h3>
        <p class="card-sub">
          {r.created} movimientos creados · {r.items.filter((i) => i.status === "nuevo").length} detectados por primera vez · {r.skipped} ya existían · {r.ignored} sin una cantidad reconocible
        </p>
      </div>
      <div class="card-head-actions">
        <Button size="sm" variant="ghost" onclick={() => go("/movimientos", { tag: "revisar" })}>Revisar movimientos pendientes</Button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Fecha</th><th>Descripción</th><th>Cuenta</th><th>Categoría</th><th>Cantidad</th><th>Resultado</th></tr>
        </thead>
        <tbody>
          {#each r.items as i (i.externalId)}
            <tr>
              <td>{dateShort(i.date)}</td>
              <td>{i.description}{#if i.bank}<span class="muted small"> · {i.bank}</span>{/if}</td>
              <td>{i.accountName}{#if i.toAccountName} → {i.toAccountName}{/if}</td>
              <td>
                {i.categoryName || "—"}
                {#if i.tags.includes("revisar")}<Tag tone="tag-warning">revisar</Tag>{/if}
              </td>
              <td><Money value={i.amount} tone={i.type} /></td>
              <td><Tag tone={statusTone(i.status)}>{i.status}</Tag></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/snippet}

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

  .csv-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-12) var(--sp-28);
  }

  .paste-account {
    min-width: 14rem;
  }
</style>
