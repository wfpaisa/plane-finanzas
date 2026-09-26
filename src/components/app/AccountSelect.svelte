<!--
  Elegir una cuenta, con la opción de crear una ahí mismo: sin cuentas (por
  ejemplo, después de borrarlo todo) el selector no se queda vacío, y la
  cuenta nueva queda elegida al guardarla.
-->
<script lang="ts">
  import { store } from "../../lib/store.svelte";
  import type { Account } from "../../lib/types";
  import { Select } from "../ui";
  import AccountForm from "./AccountForm.svelte";

  let {
    value = $bindable(""),
    placeholder = "",
    exclude = "",
    senders = [],
  }: {
    value?: string;
    /** El texto de la opción vacía; sin él, no hay opción vacía. */
    placeholder?: string;
    /** Una cuenta que no se ofrece (el origen de una transferencia). */
    exclude?: string;
    /** Remitentes con que se propone la cuenta nueva (los del correo). */
    senders?: string[];
  } = $props();

  const NEW = "__nueva__";
  const accounts = $derived(store.activeAccounts.filter((a) => a.id !== exclude));
  let creating = $state(false);
  /** Lo último elegido que es una cuenta: a eso vuelve el selector mientras se crea la nueva. */
  let prev = "";
  $effect(() => {
    if (value !== NEW) prev = value;
  });

  function pick(v: string) {
    if (v !== NEW) return;
    value = prev;
    creating = true;
  }
</script>

<Select bind:value onchange={(e) => pick(e.currentTarget.value)}>
  {#if placeholder || !accounts.length}
    <option value="">{accounts.length ? placeholder : "Todavía no tienes cuentas"}</option>
  {/if}
  {#each accounts as a (a.id)}
    <option value={a.id}>{a.name}</option>
  {/each}
  <option value={NEW}>+ Crear cuenta nueva…</option>
</Select>

<AccountForm
  open={creating}
  {senders}
  onClose={() => (creating = false)}
  onCreated={(a: Account) => (value = a.id)}
/>
