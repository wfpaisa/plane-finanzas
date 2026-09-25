<!--
  Crear o editar una cuenta: nombre, tipo, color, icono, saldo y las pistas
  con las que la importación de Gmail la reconoce.
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

  let {
    open,
    account = null,
    onClose,
  }: {
    open: boolean;
    account?: Account | null;
    onClose: () => void;
  } = $props();

  let name = $state("");
  let type = $state<AccountType>("ahorros");
  let bank = $state("");
  let icon = $state("");
  let color = $state("");
  let balance = $state(0);
  let matchKeys = $state("");
  let exclude = $state(false);
  let archived = $state(false);
  let notes = $state("");
  let busy = $state(false);
  let confirmDelete = $state(false);

  // Con la cuenta ya creada se escribe el saldo de HOY; por debajo se ajusta
  // el saldo inicial para que la suma cuadre sin inventar movimientos.
  const current = $derived(account ? store.balance(account.id) : 0);
  /** El saldo que se mostró al abrir: si no se toca, el saldo inicial no se toca. */
  let shownBalance = 0;

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
      balance = shownBalance = account ? store.balance(account.id) : 0;
      matchKeys = account?.match_keys ?? "";
      exclude = account?.exclude_from_total ?? false;
      archived = account?.archived ?? false;
      notes = account?.notes ?? "";
    });
  });

  async function save() {
    if (!name.trim()) return notify.fail(new Error("Ponle un nombre a la cuenta."));
    busy = true;
    try {
      const data = {
        owner: session.id,
        name: name.trim(),
        type,
        bank: bank.trim(),
        icon: icon || accountTypeIcon(type),
        palette: color,
        match_keys: matchKeys.trim(),
        exclude_from_total: exclude,
        archived,
        notes,
      };
      if (account) {
        // Solo si se cambió el saldo. Si no, un movimiento que llegó con el
        // formulario abierto (Gmail, otro dispositivo) quedaría anulado por
        // el ajuste. Si sí, se mide contra el saldo de ahora mismo, para que
        // quede exactamente el que se escribió.
        const changed = balance !== shownBalance;
        const initial = (store.account(account.id)?.initial_balance ?? account.initial_balance ?? 0) + (balance - current);
        await pb.collection("accounts").update(account.id, changed ? { ...data, initial_balance: initial } : data);
      } else {
        await pb.collection("accounts").create({ ...data, initial_balance: balance, sort: store.accounts.length });
      }
      await reload("accounts");
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
        <Money value={balance} />
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
      <Field label={account ? "Dinero disponible hoy" : "Dinero que tienes hoy"} hint={type === "tarjeta" || type === "credito" ? "Escribe la deuda con signo negativo. Ejemplo: −500.000." : "Este valor será el punto de partida de la cuenta."}>
        <MoneyInput bind:value={balance} allowNegative />
      </Field>
    </div>

    <Field
      label="Datos para identificar esta cuenta en los correos"
      hint="Escribe datos separados por comas, como los últimos 4 dígitos, el banco, una llave o un celular. Así, una transferencia entre tus cuentas no se registrará por error como gasto. Ejemplo: 1234, Bancolombia, @millave."
    >
      <Input bind:value={matchKeys} placeholder="1234, @millave" />
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
      <Switch bind:checked={exclude} label="Excluir del dinero total" />
      {#if account}<Switch bind:checked={archived} label="Archivada" />{/if}
    </div>
  </div>

  {#snippet footer()}
    {#if account}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}>
        <Icon name="delete-02" />Borrar
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
  title="Borrar cuenta"
  message="También se borrarán todos los movimientos de esta cuenta. Esta acción no se puede deshacer. Si quieres conservar el historial, archiva la cuenta."
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
