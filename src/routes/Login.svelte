<!-- Entrar o crear cuenta. Cada persona tiene sus propias finanzas. -->
<script lang="ts">
  import Logo from "../components/Logo.svelte";
  import { Button, Field, Input } from "../components/ui";
  import { notify } from "../lib/notify.svelte";
  import { pb } from "../lib/pb.svelte";

  let mode = $state<"login" | "register">("login");
  let name = $state("");
  let email = $state("");
  let password = $state("");
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      if (mode === "register") {
        if (password.length < 8) throw new Error("La clave debe tener al menos 8 caracteres.");
        await pb.collection("users").create({ name, email, password, passwordConfirm: password });
      }
      await pb.collection("users").authWithPassword(email, password);
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <div class="login-art">
    <div class="login-brand"><Logo size={26} /> Finanzas</div>
    <h1>Entiende y organiza tu dinero.</h1>
    <p>Consulta cuánto tienes, cuánto gastas y cómo avanzan tus ahorros. Si conectas Gmail, la aplicación puede registrar automáticamente las notificaciones del banco.</p>
    <div class="login-bubbles" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>

  <form class="login-card card card-solid" onsubmit={submit}>
    <div class="card-head">
      <div>
        <h2 class="card-title">{mode === "login" ? "Entrar" : "Crear cuenta"}</h2>
        <p class="card-sub">{mode === "login" ? "Escribe tus datos para continuar." : "Crea tus datos de acceso."}</p>
      </div>
    </div>
    <div class="card-body login-fields">
      {#if mode === "register"}
        <Field label="Nombre"><Input bind:value={name} autocomplete="name" required /></Field>
      {/if}
      <Field label="Correo"><Input type="email" bind:value={email} autocomplete="email" required /></Field>
      <Field label="Clave">
        <Input
          type="password"
          bind:value={password}
          autocomplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </Field>
      <Button type="submit" variant="secondary" loading={busy} class="login-submit">
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      <button type="button" class="link login-switch" onclick={() => (mode = mode === "login" ? "register" : "login")}>
        {mode === "login" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Entra"}
      </button>
    </div>
  </form>
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
      radial-gradient(40% 50% at 10% 90%, oklch(1 0 0 / 0.08), transparent 70%),
      oklch(0.14 0 0);
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
</style>
