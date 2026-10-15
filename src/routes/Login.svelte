<!--
  Entrar. Las cuentas nuevas solo llegan por invitación: el enlace
  (`#/invitacion?token=…`) abre aquí el formulario para elegir la clave. En una
  instalación nueva, sin usuarios, la primera persona crea su cuenta aquí mismo.
  Cada persona tiene sus propias finanzas.
-->
<script lang="ts">
  import { ClientResponseError } from "pocketbase";

  import Logo from "../components/Logo.svelte";
  import { Button, Field, Input } from "../components/ui";
  import { notify } from "../lib/notify.svelte";
  import { errorMessage, pb } from "../lib/pb.svelte";
  import { route } from "../lib/router.svelte";
  import type { User } from "../lib/types";

  type Invite = { email: string; name: string; invited_by: string };

  const token = $derived(route.path === "/invitacion" ? (route.query.get("token") ?? "") : "");

  let setupOpen = $state(false);
  let invite = $state<Invite | null>(null);
  let inviteError = $state("");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let confirm = $state("");
  let busy = $state(false);

  const mode = $derived(token ? "invite" : setupOpen ? "setup" : "login");

  // Una instalación sin usuarios todavía: se ofrece crear la primera cuenta.
  $effect(() => {
    pb.send<{ open: boolean }>("/api/finanzas/setup", {})
      .then((r) => (setupOpen = r.open))
      .catch(() => {});
  });

  $effect(() => {
    if (!token) return;
    invite = null;
    inviteError = "";
    pb.send<Invite>(`/api/finanzas/invite/${encodeURIComponent(token)}`, {})
      .then((r) => (invite = r))
      .catch((err) => (inviteError = errorMessage(err)));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      if (mode === "login") {
        await pb.collection("users").authWithPassword(email, password);
        return;
      }
      if (password.length < 8) throw new Error("La clave debe tener al menos 8 caracteres.");
      if (password !== confirm) throw new Error("La confirmación no coincide con la clave. Escríbela otra vez.");
      const res =
        mode === "invite"
          ? await pb.send<{ token: string; record: User }>(`/api/finanzas/invite/${encodeURIComponent(token)}`, {
              method: "POST",
              body: { password },
            })
          : await pb.send<{ token: string; record: User }>("/api/finanzas/setup", { method: "POST", body: { name, email, password } });
      pb.authStore.save(res.token, res.record);
      // Fuera del enlace: recargarlo ya no serviría.
      if (mode === "invite") location.replace("#/");
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 400 && mode === "login") {
        notify.fail(new Error("El correo o la clave no coinciden. Revísalos e inténtalo de nuevo."));
      } else notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <div class="login-art">
    <div class="login-brand"><Logo size={26} /> Finanzas</div>
    <h1>Entiende y organiza tu dinero.</h1>
    <p>Consulta cuánto tienes, cuánto gastas y cómo avanzan tus ahorros. Registra tus movimientos en segundos, desde el computador o el celular.</p>
    <div class="login-bubbles" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>

  {#if mode === "invite"}
    <form class="login-card card card-solid" onsubmit={submit}>
      <div class="card-head">
        <div>
          <h2 class="card-title">{inviteError ? "Enlace de invitación no válido" : "Crea tu clave"}</h2>
          <p class="card-sub">
            {#if invite}
              {invite.invited_by ? `${invite.invited_by} te invitó a Finanzas.` : "Te invitaron a Finanzas."} Elige una clave para entrar.
              Después entrarás con tu correo y esta clave.
            {:else if inviteError}
              No se puede crear la clave con este enlace.
            {:else}
              Revisando el enlace de invitación…
            {/if}
          </p>
        </div>
      </div>
      <div class="card-body login-fields">
        {#if invite}
          <Field label="Nombre"><Input value={invite.name} readonly /></Field>
          <Field label="Correo"><Input type="email" value={invite.email} autocomplete="username" readonly /></Field>
          <Field label="Clave" hint="Usa al menos 8 caracteres.">
            <Input type="password" bind:value={password} autocomplete="new-password" required />
          </Field>
          <Field label="Confirmar clave">
            <Input type="password" bind:value={confirm} autocomplete="new-password" required />
          </Field>
          <Button type="submit" variant="secondary" loading={busy} class="login-submit">Crear clave y entrar</Button>
        {:else if inviteError}
          <p class="login-note">{inviteError}</p>
          <a class="link login-switch" href="#/">Ir a la pantalla para entrar</a>
        {/if}
      </div>
    </form>
  {:else}
    <form class="login-card card card-solid" onsubmit={submit}>
      <div class="card-head">
        <div>
          <h2 class="card-title">{mode === "setup" ? "Crea la primera cuenta" : "Entrar"}</h2>
          <p class="card-sub">
            {mode === "setup"
              ? "Aún no hay cuentas en esta instalación. Crea la tuya; después podrás invitar a otras personas desde Ajustes."
              : "Escribe tu correo y tu clave para continuar."}
          </p>
        </div>
      </div>
      <div class="card-body login-fields">
        {#if mode === "setup"}
          <Field label="Nombre"><Input bind:value={name} autocomplete="name" required /></Field>
        {/if}
        <Field label="Correo"><Input type="email" bind:value={email} autocomplete="email" required /></Field>
        <Field label="Clave" hint={mode === "setup" ? "Usa al menos 8 caracteres." : undefined}>
          <Input type="password" bind:value={password} autocomplete={mode === "setup" ? "new-password" : "current-password"} required />
        </Field>
        {#if mode === "setup"}
          <Field label="Confirmar clave">
            <Input type="password" bind:value={confirm} autocomplete="new-password" required />
          </Field>
        {/if}
        <Button type="submit" variant="secondary" loading={busy} class="login-submit">
          {mode === "setup" ? "Crear cuenta" : "Entrar"}
        </Button>
        {#if mode === "login"}
          <p class="login-note">¿No tienes cuenta? Pide a alguien que ya use Finanzas que te invite.</p>
        {/if}
      </div>
    </form>
  {/if}
</div>

<style>
  .login {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    min-height: 100%;

    @media (max-width: 52rem) {
      grid-template-columns: 1fr;
    }
  }

  .login-art {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--sp-16);
    padding: 3rem;
    overflow: hidden;
    background:
      radial-gradient(50% 60% at 85% 10%, oklch(1 0 0 / 0.12), transparent 70%),
      radial-gradient(40% 50% at 10% 90%, oklch(1 0 0 / 0.08), transparent 70%), oklch(0.14 0 0);
    color: oklch(0.97 0 0);

    & h1 {
      margin: 0;
      font-size: 2.75rem;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }

    & p {
      max-width: 28rem;
      margin: 0;
      opacity: 0.88;
      line-height: 1.55;
    }

    @media (max-width: 52rem) {
      padding: 2rem 1.5rem;

      & h1 {
        font-size: 2rem;
      }
    }
  }

  .login-brand {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    font-weight: 700;
    font-size: var(--text-lg);
  }

  .login-bubbles {
    position: absolute;
    right: -4rem;
    bottom: -4rem;
    display: grid;
    grid-template-columns: repeat(2, 7rem);
    gap: 0.75rem;
    rotate: -12deg;

    & span {
      height: 7rem;
      border-radius: 1.75rem;
      border: 1px solid oklch(1 0 0 / 0.14);
      background: oklch(1 0 0 / 0.06);
      backdrop-filter: blur(8px);
    }
  }

  .login-card {
    align-self: center;
    justify-self: center;
    width: min(26rem, calc(100% - 2rem));
    margin: 2rem 0;
  }

  .login-fields {
    display: flex;
    flex-direction: column;
    gap: var(--sp-14);
  }

  /* En escritorio, a la derecha y a su medida; en el celular, a lo ancho. */
  .login-fields :global(.login-submit) {
    align-self: flex-end;
    justify-content: center;
    min-width: 8rem;

    @media (max-width: 52rem) {
      align-self: stretch;
    }
  }

  .login-switch {
    align-self: center;
    font-size: var(--text-sm);
  }

  .login-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    text-align: center;
  }
</style>
