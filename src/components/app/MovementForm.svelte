<!--
  Aportar a un ahorro (o sacar de él). La plata no se mueve de cuenta: se
  marca como apartada dentro de la cuenta elegida.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { today } from "../../lib/finance";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Saving } from "../../lib/types";
  import { Button, Field, Input, Modal, Select } from "../ui";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";

  let {
    open,
    saving,
    onClose,
  }: { open: boolean; saving: Saving | null; onClose: () => void } = $props();

  let dir = $state<"in" | "out">("in");
  let amount = $state(0);
  let account = $state("");
  let date = $state(today());
  let note = $state("");
  let splitAll = $state(false);
  let busy = $state(false);

  // Solo las cuentas propias: en un ahorro compartido cada quien aporta desde las suyas.
  const myAllocs = $derived((saving?.allocations ?? []).filter((a) => store.account(a.account)));

  // Se llena al abrir o al cambiar de saving, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open || !saving) return;
    void saving;
    untrack(() => {
      dir = "in";
      amount = saving.monthly_amount || 0;
      account = myAllocs[0]?.account ?? store.activeAccounts[0]?.id ?? "";
      date = today();
      note = "";
      splitAll = myAllocs.length > 1;
    });
  });

  async function save() {
    if (!saving || !amount) return;
    busy = true;
    try {
      const sign = dir === "in" ? 1 : -1;
      const parts =
        splitAll && dir === "in"
          ? myAllocs.map((a) => ({ account: a.account, amount: Math.round((amount * a.percent) / 100) }))
          : [{ account, amount }];
      for (const p of parts) {
        await pb.collection("saving_movements").create({
          saving: saving.id,
          account: p.account,
          created_by: session.id,
          amount: sign * p.amount,
          date: `${date} 12:00:00.000Z`,
          note: note.trim() || (dir === "in" ? "Aporte" : "Retiro"),
        });
      }
      await reload("savings");
      notify.done(dir === "in" ? "Aporte registrado" : "Retiro registrado");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} {onClose} title={saving ? `${saving.name}` : "Ahorro"} description="Registra el dinero reservado para este ahorro.">
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
    {#if dir === "in" && myAllocs.length > 1}
      <label class="choice">
        <input type="checkbox" bind:checked={splitAll} />
        Repartir según el plan ({myAllocs.map((a) => `${store.account(a.account)?.name} ${a.percent}%`).join(", ")})
      </label>
    {/if}
    {#if !(splitAll && dir === "in")}
      <Field label="Cuenta">
        <Select bind:value={account}>
          {#each store.activeAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </Select>
      </Field>
    {/if}
    <Field label="Nota"><Input bind:value={note} placeholder="Opcional" /></Field>
  </div>
  {#snippet footer()}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>
