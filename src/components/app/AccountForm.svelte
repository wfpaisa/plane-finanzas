<!--
  Crear o editar una cuenta: nombre, tipo, color, icono, dinero inicial y los
  remitentes de correo con los que la bandeja la reconoce.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { ACCOUNT_TYPES, accountTypeIcon } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { colorOf, nextColor } from "../../lib/palettes";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Account, AccountType } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Select, Switch, Textarea } from "../ui";
  import IconSelect from "./IconSelect.svelte";
  import Money from "./Money.svelte";
  import ColorDot from "./ColorDot.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    account = null,
    senders: startSenders = [],
    onClose,
    onCreated,
  }: {
    open: boolean;
    account?: Account | null;
    /** Remitentes de partida para una cuenta nueva (los del correo desde el que se crea). */
    senders?: string[];
    onClose: () => void;
    /** Al crear una: la cuenta ya guardada, para elegirla donde se pidió. */
    onCreated?: (a: Account) => void;
  } = $props();

  let name = $state("");
  let type = $state<AccountType>("ahorros");
  let bank = $state("");
  let icon = $state("");
  let color = $state("");
  let initial = $state(0);
  let senders = $state<string[]>([]);
  let refs = $state<string[]>([]);
  let exclude = $state(false);
  let archived = $state(false);
  let notes = $state("");
  let busy = $state(false);
  let confirmDelete = $state(false);

  // El saldo es el dinero inicial más la suma de los movimientos; aquí solo
  // se edita lo primero, así los movimientos nunca se descuadran.
  const moved = $derived(
    account ? store.balance(account.id) - (store.account(account.id)?.initial_balance ?? account.initial_balance ?? 0) : 0,
  );

  // Se llena al abrir o al cambiar de account, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open) return;
    void account;
    untrack(() => {
      name = account?.name ?? "";
      type = account?.type ?? "ahorros";
      bank = account?.bank ?? "";
      icon = account?.icon ?? "";
      color = account?.palette ? colorOf(account.palette) : nextColor(store.accounts.map((a) => a.palette));
      initial = account ? (store.account(account.id)?.initial_balance ?? account.initial_balance ?? 0) : 0;
      senders = [...(account?.senders ?? startSenders)];
      refs = [...(account?.refs ?? [])];
      exclude = account?.exclude_from_total ?? false;
      archived = account?.archived ?? false;
      notes = account?.notes ?? "";
    });
  });

  /** Los remitentes que Gmail lee, para elegir con un clic. */
  const knownSenders = $derived([...(store.gmail?.senders ?? [])].sort());

  async function save() {
    if (!name.trim()) return notify.fail(new Error("Ponle un nombre a la cuenta."));
    busy = true;
    let created: Account | null = null;
    try {
      const data = {
        owner: session.id,
        name: name.trim(),
        type,
        bank: bank.trim(),
        icon: icon || accountTypeIcon(type),
        palette: color,
        initial_balance: initial,
        senders,
        refs,
        exclude_from_total: exclude,
        archived,
        notes,
      };
      if (account) {
        await pb.collection("accounts").update(account.id, data);
      } else {
        created = await pb.collection("accounts").create<Account>({ ...data, sort: store.accounts.length });
      }
      await reload("accounts");
      if (created) onCreated?.(created);
      notify.done(account ? "Cuenta guardada" : "Cuenta creada");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!account) return;
    busy = true;
    try {
      await pb.collection("accounts").delete(account.id);
      await reload("accounts", "savings");
      confirmDelete = false;
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} {onClose} title={account ? "Editar cuenta" : "Nueva cuenta"} width="modal-panel-width-lg">
  <div class="account-form">
    <div class="account-preview">
      <span class="account-preview-icon"><Icon name={icon || accountTypeIcon(type)} size={20} /></span>
      <div>
        <div class="account-preview-name"><ColorDot color={color} />{name || "Nombre de la cuenta"}</div>
        <Money value={initial + moved} />
      </div>
    </div>

    <div class="form-grid">
      <Field label="Nombre">
        <Input bind:value={name} placeholder="Bancolombia ahorros" autofocus />
      </Field>
      <Field label="Tipo">
        <Select bind:value={type}>
          {#each ACCOUNT_TYPES as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </Select>
      </Field>
      <Field label="Banco o entidad">
        <Input bind:value={bank} placeholder="Bancolombia, Bold, Nequi…" />
      </Field>
      <Field
        label="Dinero inicial"
        hint={type === "tarjeta" || type === "credito"
          ? "La deuda con la que empieza la cuenta, con signo negativo. Ejemplo: −500.000. Se suma a los movimientos."
          : "El dinero con el que empieza la cuenta. Se suma a los movimientos."}
      >
        <MoneyInput bind:value={initial} allowNegative />
      </Field>
    </div>

    <Field
      label="Remitentes de correo"
      hint="Los correos de estos remitentes se leen y se asignan a esta cuenta. Basta con una parte del remitente: «nu@» o «nu.com» reconocen a nu@nu.com.co. Pulsa Enter para agregarla. Si varias cuentas coinciden, se propone la primera; una regla puede elegir otra."
    >
      <TagInput bind:value={senders} prefix="" placeholder="alertas@banco.com, banco.com…" suggestions={knownSenders} limit={30} />
    </Field>

    <Field
      label="Terminaciones y llaves"
      hint="Cómo nombran los avisos a esta cuenta: los últimos dígitos de la tarjeta o la cuenta (*1234) o una llave (@ana123). Con ellas, un aviso de compra se registra en esta cuenta, y uno que menciona otra de tus cuentas se registra como transferencia entre las dos. Pulsa Enter para agregar cada una."
    >
      <TagInput bind:value={refs} prefix="" placeholder="*1234, @ana123…" limit={20} />
    </Field>

    <div>
      <p class="eyebrow">Color</p>
      <ColorPicker bind:value={color} />
    </div>

    <div>
      <p class="eyebrow">Icono</p>
      <IconSelect bind:value={icon} />
    </div>

    <Field label="Notas">
      <Textarea bind:value={notes} rows={2} />
    </Field>

    <div class="form-switches">
      <Switch bind:checked={exclude} label="Excluir del saldo neto" />
      {#if account}<Switch bind:checked={archived} label="Archivada" />{/if}
    </div>
  </div>

  {#snippet footer()}
    {#if account}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}>
        <Icon name="delete-02" />Eliminar
      </Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Eliminar cuenta"
  message="También se eliminarán todos los movimientos de esta cuenta. Esta acción no se puede deshacer. Si quieres conservar el historial, archiva la cuenta."
  confirmText={account?.name}
  confirmHint="Escribe el nombre de la cuenta para confirmar"
  {busy}
  onConfirm={remove}
/>

<style>
  .account-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }

  .account-preview {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    padding: var(--sp-16);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-field);
    color: var(--text-primary);

    & :global(.money) {
      font-size: var(--text-lg);
      font-weight: 700;
    }
  }

  .account-preview-icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-level2);
    color: var(--text-secondary);
  }

  .account-preview-name {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .form-switches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-20);
  }
</style>
