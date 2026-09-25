<!--
  Aportar a un ahorro (o sacar de él). La plata no se mueve de cuenta: se
  marca como apartada dentro de la cuenta elegida.

  Con `movement`, corrige uno ya registrado: su valor, fecha, cuenta y nota.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { today } from "../../lib/finance";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Saving, SavingMovement } from "../../lib/types";
  import { Button, ConfirmDialog, Field, Input, Modal, Select } from "../ui";
  import Icon from "../Icon.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";

  let {
    open,
    saving,
    movement = null,
    onClose,
  }: { open: boolean; saving: Saving | null; movement?: SavingMovement | null; onClose: () => void } = $props();

  let dir = $state<"in" | "out">("in");
  let amount = $state(0);
  let account = $state("");
  let date = $state(today());
  let note = $state("");
  let busy = $state(false);
  let confirmDelete = $state(false);


  // Se llena al abrir o al cambiar de saving, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open || !saving) return;
    void saving;
    void movement;
    untrack(() => {
      if (movement) {
        dir = movement.amount < 0 ? "out" : "in";
        amount = Math.abs(movement.amount);
        account = movement.account;
        date = movement.date.slice(0, 10);
        // La nota por defecto no se escribe: si cambia a retiro, dice "Retiro".
        note = movement.note === "Aporte" || movement.note === "Retiro" ? "" : movement.note;
        return;
      }
      dir = "in";
      // En un ahorro compartido, de partida lo que me toca a mí del aporte.
      const share = store.savingShare(saving);
      amount = Math.round((saving.monthly_amount || 0) * (share || 1));
      // La del último aporte a este ahorro; si no hay, la primera cuenta.
      account = store.lastSavingAccount(saving.id) || store.activeAccounts[0]?.id || "";
      date = today();
      note = "";
    });
  });

  async function save() {
    if (!saving || !amount) return;
    busy = true;
    try {
      const sign = dir === "in" ? 1 : -1;
      if (movement) {
        await pb.collection("saving_movements").update(movement.id, {
          account,
          amount: sign * amount,
          date: `${date} 12:00:00.000Z`,
          note: note.trim() || (dir === "in" ? "Aporte" : "Retiro"),
        });
        await reload("savings");
        notify.done("Movimiento actualizado");
        onClose();
        return;
      }
      await pb.collection("saving_movements").create({
        saving: saving.id,
        account,
        created_by: session.id,
        amount: sign * amount,
        date: `${date} 12:00:00.000Z`,
        note: note.trim() || (dir === "in" ? "Aporte" : "Retiro"),
      });
      await reload("savings");
      notify.done(dir === "in" ? "Aporte registrado" : "Retiro registrado");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!movement) return;
    busy = true;
    try {
      await pb.collection("saving_movements").delete(movement.id);
      await reload("savings");
      notify.done("Movimiento borrado");
      confirmDelete = false;
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  // Al corregir el aporte de otra persona su cuenta no es mía: se queda la que tenía.
  const foreignAccount = $derived(!!movement && !!account && !store.account(account));
</script>

<Modal
  {open}
  {onClose}
  title={saving ? `${saving.name}` : "Ahorro"}
  description={movement ? "Corrige este movimiento del ahorro." : "Registra el dinero reservado para este ahorro."}
>
  <div class="stack">
    <Segmented
      bind:value={dir}
      full
      options={[
        { id: "in", label: "Aportar", icon: "add-circle" },
        { id: "out", label: "Retirar", icon: "remove-circle" },
      ]}
    />
    <div class="form-grid">
      <Field label="Cantidad"><MoneyInput bind:value={amount} autofocus /></Field>
      <Field label="Fecha"><input type="date" class="field-control w-full" bind:value={date} /></Field>
    </div>
    {#if foreignAccount}
      <p class="small muted">Sale de la cuenta de otra persona del ahorro; esa no se puede cambiar desde aquí.</p>
    {:else}
      <Field label="Cuenta" tip="Dónde queda guardado este dinero. En Cuentas, la columna «Para ahorros» suma lo de cada una.">
        <Select bind:value={account}>
          {#if movement && !movement.account}<option value="">Sin cuenta</option>{/if}
          {#each store.activeAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </Select>
      </Field>
    {/if}
    <Field label="Nota"><Input bind:value={note} placeholder="Opcional" /></Field>
  </div>
  {#snippet footer()}
    {#if movement}
      <button type="button" class="btn-icon foot-icon foot-danger" aria-label="Borrar" data-tip="Borrar" onclick={() => (confirmDelete = true)}>
        <Icon name="delete-02" size={18} />
      </button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Borrar movimiento"
  message="Sale del ahorro. No se puede deshacer."
  {busy}
  onConfirm={remove}
/>

<style>
  .foot-icon {
    flex: none;
    width: 3rem;
    height: 3rem;
  }

  .foot-danger {
    color: var(--danger);
  }
</style>
