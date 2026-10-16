<!--
  El token de acceso: para que un asistente (Claude, ChatGPT…) o un programa
  use la cuenta por la API sin la clave. Cada persona tiene uno solo, que no
  vence y se puede volver a ver aquí, junto con las instrucciones listas para
  pegarle al asistente. Debajo, el contexto que el asistente lee en la guía. Ver pocketbase/pb_hooks/lib/tokens.js.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Textarea, WarnNote } from "../ui";
  import { copyText } from "../../lib/copy";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";

  type Scope = "read" | "write";
  /** `token` vacío: es de antes y solo quedó su hash; `count` > 1: quedan varios de antes. */
  type Mine = { token: string | null; scope?: Scope; last_used?: string; created?: string; count?: number };

  const origin = window.location.origin;
  const PATH = "/api/finanzas/tokens";

  let mine = $state<Mine | null>(null);
  let scope = $state<Scope>("write");
  let shown = $state(false);
  let busy = $state(false);
  let confirm = $state<"renew" | "remove" | null>(null);

  /** Tiene un token que se puede mostrar. */
  const ready = $derived(!!mine?.token && mine.count === 1);
  /** Tiene tokens de antes, que funcionan pero no se pueden mostrar. */
  const legacy = $derived(!!mine && mine.token !== null && !ready);

  function day(s: string) {
    return new Date(s.replace(" ", "T")).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
  }

  function prompt(token: string, s: Scope) {
    return [
      "Vas a ayudarme con mi cuenta de Finanzas, una app de finanzas personales, usando su API HTTP.",
      `URL base: ${origin}`,
      `Token: ${token}`,
      "Envía el token en cada petición con la cabecera: Authorization: Bearer <token>",
      `Primero lee la guía completa: GET ${origin}/api/finanzas/guia. Explica las colecciones, las rutas y los pasos para cada tarea.`,
      s === "write"
        ? "Antes de crear, cambiar o borrar datos, muéstrame lo que vas a hacer y espera mi confirmación."
        : "El token es de solo lectura: consulta y propón cambios, pero no intentes hacerlos.",
      "Tarea: ayúdame a registrar mis movimientos y a poner al día los pagos programados de este mes.",
    ].join("\n");
  }

  function apply(r: Mine) {
    mine = r;
    if (r.scope) scope = r.scope;
  }

  $effect(() => {
    pb.send<Mine>(PATH, {}).then(apply, notify.fail);
  });

  /** Crea el token (o uno nuevo con `renew`) o guarda el permiso. Devuelve si salió bien. */
  async function save(renew: boolean) {
    busy = true;
    const first = mine?.token === null;
    try {
      apply(await pb.send<Mine>(PATH, { method: "POST", body: { scope, renew } }));
      confirm = null;
      if (renew) {
        shown = false;
        notify.done(first ? "Token creado. Copia las instrucciones y pégalas en tu asistente." : "Se creó un token nuevo. El anterior ya no funciona.");
      }
      return true;
    } catch (err) {
      notify.fail(err);
      if (mine?.scope) scope = mine.scope;
      return false;
    } finally {
      busy = false;
    }
  }

  /** Con un token que ya se ve, cambiar el permiso lo guarda de una vez. */
  async function changeScope() {
    if (!ready || scope === mine?.scope) return;
    if (await save(false)) notify.done(scope === "write" ? "El token ahora puede consultar y cambiar." : "El token ahora solo puede consultar.");
  }

  async function remove() {
    busy = true;
    try {
      apply(await pb.send<Mine>(PATH, { method: "DELETE" }));
      confirm = null;
      notify.done("Token eliminado.");
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  // El contexto para el asistente: texto libre que va dentro de la guía.
  let ctx = $state<string | null>(null);
  let ctxSaved = $state("");
  let ctxBusy = $state(false);

  $effect(() => {
    pb.send<{ context: string }>("/api/finanzas/contexto", {}).then((r) => (ctx = ctxSaved = r.context), notify.fail);
  });

  async function saveContext() {
    ctxBusy = true;
    try {
      const r = await pb.send<{ context: string }>("/api/finanzas/contexto", { method: "PUT", body: { context: ctx ?? "" } });
      ctx = ctxSaved = r.context;
      notify.done("Contexto guardado. El asistente lo leerá la próxima vez que consulte la guía.");
    } catch (err) {
      notify.fail(err);
    } finally {
      ctxBusy = false;
    }
  }

  async function copy(text: string, what: string) {
    if (await copyText(text)) notify.done(`${what} copiado.`);
    else notify.fail(new Error("No se pudo copiar. Selecciona el texto y cópialo a mano."));
  }
</script>

<div class="stack">
  <div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-title">Token de acceso</h3>
        <p class="card-sub">
          Un token permite que un asistente o programa acceda a tus datos sin conocer tu clave. Sus permisos se definen abajo. No permite cambiar tu clave, importar respaldos ni eliminar todos tus datos. No vence; elimínalo cuando dejes de usarlo.
        </p>
      </div>
    </div>
    <div class="card-body stack">
      {#if !mine}
        <p class="empty-card">Cargando el token…</p>
      {:else}
        {#if legacy}
          <WarnNote message="Tu token actual se creó antes y no se puede mostrar. Sigue funcionando. Para verlo, crea uno nuevo: el anterior dejará de funcionar." />
        {/if}

        <!-- Consultar va siempre: sin él el token no sirve. Cambiar se quita para dejarlo de solo lectura. -->
        <fieldset class="token-perms">
          <legend class="field-label">Permisos</legend>
          <label class="token-perm">
            <input type="checkbox" checked disabled />
            <span>
              <b>Consultar</b>
              <small>Ver tus cuentas, movimientos, categorías y movimientos programados. Siempre incluido.</small>
            </span>
          </label>
          <label class="token-perm">
            <input
              type="checkbox"
              checked={scope === "write"}
              disabled={busy}
              onchange={(e) => {
                scope = e.currentTarget.checked ? "write" : "read";
                void changeScope();
              }}
            />
            <span>
              <b>Cambiar</b>
              <small>Crear, editar y eliminar cuentas, categorías, movimientos y movimientos programados. Sin este permiso, solo podrá proponerte cambios.</small>
            </span>
          </label>
        </fieldset>

        {#if ready}
          <Field label="Tu token" hint={`Creado el ${day(mine.created!)} · ${mine.last_used ? `Último uso: ${day(mine.last_used)}` : "Aún no se ha usado"}`}>
            <div class="token-copy">
              <Input value={mine.token!} type={shown ? "text" : "password"} readonly onfocus={(e) => e.currentTarget.select()} />
              <Button variant="ghost" onclick={() => (shown = !shown)} aria-label={shown ? "Ocultar token" : "Mostrar token"}>
                <Icon name={shown ? "view-off" : "view"} />
              </Button>
              <Button onclick={() => copy(mine!.token!, "Token")}><Icon name="copy-01" />Copiar</Button>
            </div>
          </Field>
          <Field label="Instrucciones para el asistente" hint="Pégalas en Claude, ChatGPT u otro asistente. Cambia la última línea por lo que necesites.">
            <!-- Con el token oculto, las instrucciones tampoco lo muestran; al copiarlas sí va completo. -->
            <Textarea value={prompt(shown ? mine.token! : `${mine.token!.slice(0, 6)}••••••••`, scope)} rows={7} readonly />
          </Field>
          <div class="token-actions">
            <Button variant="secondary" onclick={() => copy(prompt(mine!.token!, scope), "Instrucciones")}><Icon name="copy-01" />Copiar instrucciones</Button>
            <span class="flex-1"></span>
            <span class="token-actions">
              <Button variant="ghost" onclick={() => (confirm = "renew")}><Icon name="refresh" />Crear token nuevo</Button>
              <Button variant="ghost" class="btn-danger" onclick={() => (confirm = "remove")}><Icon name="delete-02" />Eliminar token</Button>
            </span>
          </div>
        {:else}
          <div class="token-actions">
            <Button variant="secondary" loading={busy} onclick={() => (legacy ? (confirm = "renew") : save(true))}>
              <Icon name="add-01" />{legacy ? "Crear token nuevo" : "Crear token"}
            </Button>
            {#if legacy}
              <span class="flex-1"></span>
              <Button variant="ghost" class="btn-danger" onclick={() => (confirm = "remove")}><Icon name="delete-02" />Eliminar token</Button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-title">Contexto para el asistente</h3>
        <p class="card-sub">
          Añade información útil para identificar cuentas y clasificar comercios. Escribe un dato por línea. El asistente leerá este contexto al consultar la guía y podrá actualizarlo con tu aprobación si tiene permiso para cambiar datos.
        </p>
      </div>
    </div>
    <div class="card-body stack">
      {#if ctx === null}
        <p class="empty-card">Cargando el contexto…</p>
      {:else}
        <Textarea
          bind:value={ctx}
          rows={6}
          maxlength={10000}
          aria-label="Contexto para el asistente"
          placeholder={"La llave @ana123 es mi cuenta Nubank.\nLa cuenta *1234 es Banco Principal.\nLo que diga Rappi va en la categoría Domicilios."}
        />
        <div class="token-actions">
          <Button variant="secondary" loading={ctxBusy} disabled={ctx.trim() === ctxSaved} onclick={saveContext}>Guardar contexto</Button>
        </div>
      {/if}
    </div>
  </div>
</div>

<ConfirmDialog
  open={confirm === "renew"}
  onClose={() => (confirm = null)}
  title="Crear token nuevo"
  message="El token actual dejará de funcionar de inmediato. Tendrás que darle el nuevo a cada asistente o programa que lo use. Tus datos no cambian."
  confirmLabel="Crear token nuevo"
  confirmVariant="secondary"
  {busy}
  onConfirm={() => save(true)}
/>

<ConfirmDialog
  open={confirm === "remove"}
  onClose={() => (confirm = null)}
  title="Eliminar token"
  message="El token dejará de funcionar de inmediato y quien lo use ya no podrá entrar a tu cuenta. Tus datos no cambian. Puedes crear otro cuando quieras."
  confirmLabel="Eliminar token"
  {busy}
  onConfirm={remove}
/>

<style>
  .token-copy {
    display: flex;
    gap: var(--sp-8);

    & :global(input) {
      font-family: ui-monospace, monospace;
    }
  }

  .token-perms {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    margin: 0;
    padding: 0;
    border: 0;

    & legend {
      margin-bottom: var(--sp-8);
      padding: 0;
    }
  }

  .token-perm {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-10);
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;

    & input {
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
      margin: 0.125rem 0 0;
      accent-color: var(--accent);
      cursor: inherit;
    }

    &:has(input:disabled) {
      cursor: default;
    }

    & span {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2, 0.125rem);
    }

    & b {
      font-weight: 500;
    }

    & small {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .token-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
  }
</style>
