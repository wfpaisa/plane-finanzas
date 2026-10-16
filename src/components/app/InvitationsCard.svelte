<!--
  Invitar personas. Solo se entra por invitación: se escribe el nombre y el
  correo, la aplicación crea un enlace y lo copia. Las invitaciones sin usar
  quedan en la lista para volver a copiar el enlace, renovarlo si venció o
  eliminarlas. Ver `pb_hooks/lib/invitations.js`.
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input } from "../ui";
  import { copyText } from "../../lib/copy";
  import { dateShort } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";

  type Invitation = { id: string; email: string; name: string; token: string; expires: string; accepted: string };

  let list = $state<Invitation[]>([]);
  let name = $state("");
  let email = $state("");
  let busy = $state(false);
  let removing = $state<Invitation | null>(null);
  let removeBusy = $state(false);

  /** PocketBase guarda en UTC: la fecha se muestra en la hora de quien la ve. */
  const when = (s: string) => new Date(s.replace(" ", "T"));
  const day = (s: string) => {
    const d = when(s);
    return dateShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const expired = (i: Invitation) => !i.accepted && when(i.expires).getTime() < Date.now();
  const linkOf = (i: Invitation) => `${location.origin}${location.pathname}#/invitacion?token=${i.token}`;
  const firstName = (i: Invitation) => i.name.split(" ")[0] || i.email;

  async function load() {
    try {
      list = await pb.collection("invitations").getFullList<Invitation>({ sort: "-created" });
    } catch (err) {
      notify.fail(err);
    }
  }

  $effect(() => {
    void load();
  });

  async function copy(i: Invitation) {
    const ok = await copyText(linkOf(i));
    if (ok) notify.done(`Enlace copiado. Envíalo a ${firstName(i)}.`);
    else notify.fail(new Error("No se pudo copiar el enlace. Inténtalo de nuevo."));
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      const inv = await pb.send<Invitation>("/api/finanzas/invitations", { method: "POST", body: { name, email } });
      name = email = "";
      await load();
      await copy(inv);
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function renew(i: Invitation) {
    try {
      const inv = await pb.send<Invitation>(`/api/finanzas/invitations/${i.id}/renew`, { method: "POST" });
      await load();
      await copy(inv);
    } catch (err) {
      notify.fail(err);
    }
  }

  async function remove() {
    if (!removing) return;
    removeBusy = true;
    try {
      await pb.send(`/api/finanzas/invitations/${removing.id}`, { method: "DELETE" });
      notify.done(`Se eliminó la invitación de ${firstName(removing)}.`);
      removing = null;
      await load();
    } catch (err) {
      notify.fail(err);
    } finally {
      removeBusy = false;
    }
  }
</script>

<div class="card">
  <div class="card-head">
    <div>
      <h3 class="card-title">Invitar personas</h3>
      <p class="card-sub">
        Cada persona necesita una invitación para crear su cuenta. El enlace vence a los 7 días.
      </p>
    </div>
  </div>
  <div class="card-body stack">
    <form class="inv-form" onsubmit={create}>
      <Field label="Nombre"><Input bind:value={name} autocomplete="off" required /></Field>
      <Field label="Correo" tip="Con este correo entrará la persona invitada.">
        <Input type="email" bind:value={email} autocomplete="off" required />
      </Field>
      <div><Button type="submit" loading={busy}><Icon name="link-01" />Crear y copiar enlace</Button></div>
    </form>

    {#if list.length}
      <ul class="inv-list">
        {#each list as i (i.id)}
          {@const old = expired(i)}
          <li>
            <span class="inv-who">
              <span>{i.name || i.email}</span>
              <small>{i.email}</small>
              <small class="inv-state" class:ok={!!i.accepted} class:old>
                {#if i.accepted}
                  Aceptada el {day(i.accepted)}
                {:else if old}
                  Enlace vencido el {day(i.expires)}
                {:else}
                  Pendiente · el enlace vence el {day(i.expires)}
                {/if}
              </small>
            </span>
            {#if !i.accepted}
              <span class="inv-actions">
                {#if old}
                  <Button size="sm" onclick={() => renew(i)}><Icon name="refresh" />Renovar y copiar enlace</Button>
                {:else}
                  <Button size="sm" onclick={() => copy(i)}><Icon name="copy-01" />Copiar enlace</Button>
                {/if}
                <Button
                  size="sm"
                  variant="ghost"
                  class="btn-danger"
                  aria-label={`Eliminar la invitación de ${i.name || i.email}`}
                  title="Eliminar invitación"
                  onclick={() => (removing = i)}><Icon name="delete-02" /></Button
                >
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<ConfirmDialog
  open={!!removing}
  onClose={() => (removing = null)}
  title="Eliminar invitación"
  message={`El enlace dejará de funcionar y ${removing ? firstName(removing) : ""} no podrá crear su cuenta con él. Puedes invitarla de nuevo cuando quieras.`}
  confirmLabel="Eliminar invitación"
  busy={removeBusy}
  onConfirm={remove}
/>

<style>
  .inv-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    align-items: end;
    gap: var(--sp-12);
  }

  .inv-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;

    & li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-8) var(--sp-12);
      padding: var(--sp-10) 0;
    }

    & li + li {
      border-top: 1px solid var(--border);
    }
  }

  .inv-who {
    display: flex;
    flex-direction: column;
    min-width: 0;

    & > span {
      font-weight: 500;
    }

    & small {
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
  }

  .inv-state {
    &.ok {
      color: var(--income, var(--text-muted));
    }

    &.old {
      color: var(--danger, var(--text-muted));
    }
  }

  .inv-actions {
    display: flex;
    gap: var(--sp-6);
  }
</style>
