<!--
  Cambiar la clave. PocketBase pide la actual y, al cambiarla, cierra todas
  las sesiones (también esta): se vuelve a entrar con la nueva sin que la
  persona lo note. Los tokens de acceso no dependen de la clave y siguen.
-->
<script lang="ts">
  import { ClientResponseError } from "pocketbase";

  import { Button, Field, Input } from "../ui";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";

  let current = $state("");
  let next = $state("");
  let confirm = $state("");
  let busy = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (next.length < 8) return notify.fail(new Error("La clave nueva debe tener al menos 8 caracteres."));
    if (next !== confirm) return notify.fail(new Error("La confirmación no coincide con la clave nueva. Escríbela otra vez."));
    if (next === current) return notify.fail(new Error("La clave nueva debe ser distinta de la actual."));
    const email = session.user?.email ?? "";
    busy = true;
    try {
      await pb.collection("users").update(session.id, { oldPassword: current, password: next, passwordConfirm: confirm });
      await pb.collection("users").authWithPassword(email, next);
      current = next = confirm = "";
      notify.done("Clave cambiada. Las demás sesiones se cerraron.");
    } catch (err) {
      if (err instanceof ClientResponseError && err.response?.data?.oldPassword) {
        notify.fail(new Error("La clave actual no es correcta. Revísala e inténtalo de nuevo."));
      } else notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<form class="card" onsubmit={save}>
  <div class="card-head">
    <div>
      <h3 class="card-title">Cambiar clave</h3>
      <p class="card-sub">Al cambiarla se cierra la sesión en los demás dispositivos. Los tokens de acceso siguen activos.</p>
    </div>
  </div>
  <div class="card-body stack">
    <!-- Para que el gestor de claves sepa de qué cuenta es. -->
    <input type="email" value={session.user?.email ?? ""} autocomplete="username" hidden readonly />
    <Field label="Clave actual"><Input type="password" bind:value={current} autocomplete="current-password" required /></Field>
    <Field label="Clave nueva" hint="Usa al menos 8 caracteres."><Input type="password" bind:value={next} autocomplete="new-password" required /></Field>
    <Field label="Confirmar clave nueva"><Input type="password" bind:value={confirm} autocomplete="new-password" required /></Field>
    <div><Button type="submit" loading={busy}>Cambiar clave</Button></div>
  </div>
</form>
