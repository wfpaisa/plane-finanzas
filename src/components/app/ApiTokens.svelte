<!--
  Tokens de acceso: para que un asistente (Claude, ChatGPT…) o un programa
  use la cuenta por la API sin la clave. El servidor genera el token y guarda
  solo su hash, así que se muestra una única vez, al crearlo, junto con las
  instrucciones listas para pegarle al asistente. Ver
  pocketbase/pb_hooks/lib/tokens.js.
-->
<script lang="ts">
  import Segmented from "./Segmented.svelte";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Textarea } from "../ui";
  import Tag from "../ui/Tag.svelte";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";

  type Scope = "read" | "write";
  type Token = { id: string; name: string; prefix: string; scope: Scope; expires: string; last_used: string; created: string };

  const EXPIRY = [
    { days: 7, label: "En 7 días" },
    { days: 30, label: "En 30 días" },
    { days: 90, label: "En 90 días" },
    { days: 365, label: "En 1 año" },
    { days: 0, label: "Nunca" },
  ];

  const origin = window.location.origin;

  let tokens = $state<Token[]>([]);
  let loading = $state(true);

  let open = $state(false);
  let name = $state("");
  let scope = $state<Scope>("read");
  let days = $state("30");
  let busy = $state(false);
  /** El token recién creado: solo se ve hasta cerrar la ventana. */
  let created = $state<{ name: string; token: string; scope: Scope } | null>(null);

  let removing = $state<Token | null>(null);
  let deleting = $state(false);

  const now = () => new Date().toISOString().replace("T", " ");
  const expired = (t: Token) => !!t.expires && t.expires < now();

  function day(s: string) {
    return new Date(s.replace(" ", "T")).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  }

  function prompt(token: string, s: Scope) {
    return [
      "Vas a ayudarme con mi cuenta de Finanzas, una app de finanzas personales, usando su API HTTP.",
      `URL base: ${origin}`,
      `Token: ${token}`,
      "Envía el token en cada petición con la cabecera: Authorization: Bearer <token>",
      `Primero lee la guía completa: GET ${origin}/api/finanzas/guia. Explica las colecciones, las rutas, las reglas y los pasos para cada tarea.`,
      s === "write"
        ? "Antes de crear, cambiar o borrar datos, muéstrame lo que vas a hacer y espera mi confirmación."
        : "El token es de solo lectura: consulta y propón cambios, pero no intentes hacerlos.",
      "Tarea: revisa los correos pendientes de la bandeja, agrúpalos por remitente y comercio, y propón las reglas para que se registren solos.",
    ].join("\n");
  }

  async function load() {
    try {
      tokens = await pb.collection("api_tokens").getFullList<Token>({ sort: "-created" });
    } catch (err) {
      notify.fail(err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  function startCreate() {
    name = "";
    scope = "read";
    days = "30";
    created = null;
    open = true;
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return notify.fail(new Error("Escribe un nombre para reconocer el token, como «Claude en mi computador»."));
    busy = true;
    try {
      const r = await pb.send<{ token: string; name: string; scope: Scope }>("/api/finanzas/tokens", {
        method: "POST",
        body: { name: name.trim(), scope, days: +days },
      });
      created = { name: r.name, token: r.token, scope: r.scope };
      await load();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify.done(`${what} copiado.`);
    } catch {
      notify.fail(new Error("No se pudo copiar. Selecciona el texto y cópialo a mano."));
    }
  }

  async function remove() {
    if (!removing) return;
    deleting = true;
    try {
      await pb.collection("api_tokens").delete(removing.id);
      removing = null;
      await load();
      notify.done("Token eliminado.");
    } catch (err) {
      notify.fail(err);
    } finally {
      deleting = false;
    }
  }
</script>

<div class="stack">
  <div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-title">Tokens de acceso</h3>
        <p class="card-sub">
          Un token permite que un asistente como Claude o ChatGPT, o un programa tuyo, consulte y configure tu cuenta sin conocer tu clave. Elimínalo cuando ya no lo uses.
        </p>
      </div>
      <div class="card-head-actions">
        <Button size="sm" variant="secondary" onclick={startCreate}><Icon name="add-01" />Crear token</Button>
      </div>
    </div>
    <div class="card-body">
      {#if loading}
        <p class="empty-card">Cargando tokens…</p>
      {:else if tokens.length}
        <ul class="token-list">
          {#each tokens as t (t.id)}
            <li class="token-row" class:token-off={expired(t)}>
              <span class="token-ico"><Icon name="key-01" size={16} /></span>
              <span class="token-main">
                <span class="token-name">
                  {t.name}
                  <Tag tone={t.scope === "write" ? "tag-warning" : "tint-1"}>{t.scope === "write" ? "Consultar y cambiar" : "Solo consultar"}</Tag>
                  {#if expired(t)}<Tag tone="off">Vencido</Tag>{/if}
                </span>
                <span class="token-meta">
                  <code>{t.prefix}…</code> · Creado el {day(t.created)} ·
                  {t.last_used ? `Último uso: ${day(t.last_used)}` : "Sin usar"} ·
                  {t.expires ? `${expired(t) ? "Venció" : "Vence"} el ${day(t.expires)}` : "No vence"}
                </span>
              </span>
              <Button size="sm" variant="ghost" class="btn-danger" onclick={() => (removing = t)}><Icon name="delete-02" />Eliminar</Button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty-card">Aún no tienes tokens. Crea uno para que un asistente o un programa pueda usar tu cuenta.</p>
      {/if}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-title">Cómo usarlo con un asistente</h3>
        <p class="card-sub">El asistente trabaja solo con la API: no necesita el código de la aplicación.</p>
      </div>
    </div>
    <div class="card-body">
      <ol class="token-steps">
        <li>Crea un token. Elige <b>Solo consultar</b> si solo quieres que revise y proponga, o <b>Consultar y cambiar</b> si quieres que cree reglas, categorías o movimientos.</li>
        <li>Copia las instrucciones que aparecen al crearlo y pégalas en el asistente. Incluyen el token y la dirección de la guía.</li>
        <li>El asistente lee la guía en <code>{origin}/api/finanzas/guia</code>, donde están los datos que puede usar y los pasos de cada tarea.</li>
        <li>Revisa lo que propone antes de aceptar cambios. Ningún token puede cambiar tu clave, conectar Gmail, cargar un respaldo ni eliminar todos tus datos.</li>
      </ol>
    </div>
  </div>
</div>

<Modal {open} onClose={() => (open = false)} title={created ? "Token creado" : "Crear token de acceso"}>
  {#if created}
    <div class="stack">
      <p class="token-warn"><Icon name="alert-02" />Copia el token ahora. Por seguridad, no podrás volver a verlo.</p>
      <Field label="Token de «{created.name}»">
        <div class="token-copy">
          <Input value={created.token} readonly onfocus={(e) => e.currentTarget.select()} />
          <Button onclick={() => copy(created!.token, "Token")}><Icon name="copy-01" />Copiar</Button>
        </div>
      </Field>
      <Field label="Instrucciones para el asistente" hint="Pégalas en Claude, ChatGPT u otro asistente. Cambia la última línea por lo que necesites.">
        <Textarea value={prompt(created.token, created.scope)} rows={8} readonly />
      </Field>
    </div>
  {:else}
    <form id="token-form" class="stack" onsubmit={create}>
      <Field label="Nombre" hint="Para reconocerlo en la lista, por ejemplo «Claude en mi computador».">
        <Input bind:value={name} maxlength={80} autofocus required />
      </Field>
      <div class="field block" role="group" aria-labelledby="token-scope-label">
        <span class="field-label" id="token-scope-label">Permiso</span>
        <Segmented
          label="Permiso"
          bind:value={scope}
          full
          options={[
            { id: "read", label: "Solo consultar" },
            { id: "write", label: "Consultar y cambiar" },
          ]}
        />
        <span class="field-hint">
          {scope === "write"
            ? "Podrá crear, editar y eliminar cuentas, categorías, reglas y movimientos."
            : "Podrá ver tus datos y proponer cambios, pero no hacerlos."}
        </span>
      </div>
      <Field label="Vencimiento" hint="Después de esta fecha el token deja de funcionar.">
        <Select bind:value={days}>
          {#each EXPIRY as x (x.days)}<option value={String(x.days)}>{x.label}</option>{/each}
        </Select>
      </Field>
    </form>
  {/if}
  {#snippet footer()}
    {#if created}
      <Button onclick={() => copy(prompt(created!.token, created!.scope), "Instrucciones")}><Icon name="copy-01" />Copiar instrucciones</Button>
      <Button variant="secondary" onclick={() => (open = false)}>Listo, ya lo copié</Button>
    {:else}
      <Button onclick={() => (open = false)}>Cancelar</Button>
      <Button variant="secondary" type="submit" form="token-form" loading={busy}>Crear token</Button>
    {/if}
  {/snippet}
</Modal>

<ConfirmDialog
  open={!!removing}
  onClose={() => (removing = null)}
  title="Eliminar token"
  message={`«${removing?.name}» dejará de funcionar de inmediato y quien lo use ya no podrá entrar a tu cuenta. Tus datos no cambian. Esta acción no se puede deshacer.`}
  confirmLabel="Eliminar token"
  busy={deleting}
  onConfirm={remove}
/>

<style>
  .token-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .token-row {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: var(--sp-8);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);

    @media (max-width: 40rem) {
      flex-wrap: wrap;
    }
  }

  .token-off {
    opacity: 0.6;
  }

  .token-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm);
    background: var(--bg-hover);
  }

  .token-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .token-name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .token-meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .token-steps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin: 0;
    padding-left: 1.25rem;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  code {
    font-size: 0.95em;
    overflow-wrap: anywhere;
  }

  .token-copy {
    display: flex;
    gap: var(--sp-8);

    & :global(input) {
      font-family: ui-monospace, monospace;
    }
  }

  .token-warn {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }
</style>
