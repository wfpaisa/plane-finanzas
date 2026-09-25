<!-- Un fijo: el sueldo, la cuota del crédito, la administración, el predial… -->
<script lang="ts">
  import { untrack } from "svelte";

  import type { Kind } from "../../lib/finance";
  import { monthName } from "../../lib/format";
  import { FREQUENCIES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Recurring } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, Field, Input, Modal, Select, Switch } from "../ui";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";

  let {
    open,
    item = null,
    kind: presetKind = "expense",
    onClose,
  }: { open: boolean; item?: Recurring | null; kind?: Kind; onClose: () => void } = $props();

  let kind = $state<Kind>("expense");
  let name = $state("");
  let amount = $state(0);
  let frequency = $state<"monthly" | "yearly" | "once">("monthly");
  let day = $state(1);
  let month = $state(1);
  let start = $state("");
  let end = $state("");
  let category = $state("");
  let account = $state("");
  let paused = $state(false);
  let auto = $state(false);
  let busy = $state(false);

  // Se llena al abrir o al cambiar de item, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open) return;
    void item;
    untrack(() => {
      kind = item?.kind ?? presetKind;
      name = item?.name ?? "";
      amount = item?.amount ?? 0;
      frequency = item?.frequency || "monthly";
      day = item?.day_of_month || 1;
      month = item?.month || 1;
      start = item?.start_date?.slice(0, 10) ?? "";
      end = item?.end_date?.slice(0, 10) ?? "";
      category = item?.category ?? "";
      account = item?.account ?? "";
      paused = item?.paused ?? false;
      auto = item?.auto_create ?? false;
    });
  });

  const cats = $derived(store.categories.filter((c) => c.kind === kind));

  async function save() {
    if (!name.trim() || !amount) return notify.fail(new Error("Escribe un nombre y una cantidad."));
    if (auto && !account) return notify.fail(new Error("Selecciona una cuenta para crear el movimiento automáticamente."));
    busy = true;
    try {
      const data = {
        owner: session.id,
        kind,
        name: name.trim(),
        amount,
        frequency,
        day_of_month: day,
        month,
        start_date: start ? `${start} 12:00:00.000Z` : "",
        end_date: end ? `${end} 12:00:00.000Z` : "",
        category,
        account,
        paused,
        auto_create: auto,
      };
      if (item) await pb.collection("recurring").update(item.id, data);
      else await pb.collection("recurring").create(data);
      await reload("recurring");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!item) return;
    busy = true;
    try {
      await pb.collection("recurring").delete(item.id);
      await reload("recurring");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} {onClose} title={item ? "Editar movimiento frecuente" : kind === "income" ? "Nuevo ingreso frecuente" : "Nuevo gasto frecuente"}>
  <div class="stack">
    <Segmented
      bind:value={kind}
      full
      options={[
        { id: "expense", label: "Gasto", icon: "money-send-01" },
        { id: "income", label: "Ingreso", icon: "money-receive-01" },
      ]}
    />
    <div class="form-grid">
      <Field label="Nombre"><Input bind:value={name} placeholder="Crédito hipotecario" autofocus /></Field>
      <Field label="Cantidad"><MoneyInput bind:value={amount} /></Field>
      <Field label="Cada cuánto ocurre">
        <Select bind:value={frequency}>
          {#each FREQUENCIES as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
        </Select>
      </Field>
      {#if frequency === "once"}
        <Field label="Fecha"><input type="date" class="field-control w-full" bind:value={start} /></Field>
      {:else}
        <Field label="Día del mes"><Input type="number" min="1" max="31" bind:value={day} /></Field>
      {/if}
      {#if frequency === "yearly"}
        <Field label="Mes">
          <Select bind:value={month}>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<option value={m}>{monthName(m)}</option>{/each}
          </Select>
        </Field>
      {/if}
      <Field label="Categoría">
        <Select bind:value={category}>
          <option value="">Sin categoría</option>
          {#each cats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </Select>
      </Field>
      <Field label="Cuenta">
        <Select bind:value={account}>
          <option value="">Cualquiera</option>
          {#each store.activeAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </Select>
      </Field>
      {#if frequency !== "once"}
        <Field label="Desde (opcional)"><input type="date" class="field-control w-full" bind:value={start} /></Field>
        <Field label="Hasta (opcional)" hint="Ej: la última cuota del crédito"><input type="date" class="field-control w-full" bind:value={end} /></Field>
      {/if}
    </div>
    <div class="flex flex-wrap gap-5">
      <Switch bind:checked={auto} label="Crear el movimiento automáticamente" />
      <Switch bind:checked={paused} label="Pausar este movimiento" />
    </div>
    {#if auto}
      <p class="small muted">
        La aplicación creará este movimiento cada {frequency === "yearly" ? "año" : "mes"}, a partir de la fecha indicada. No mueve dinero en el banco. Si Gmail ya registra este movimiento, desactiva esta opción para evitar duplicados.
      </p>
    {/if}
  </div>
  {#snippet footer()}
    {#if item}
      <Button variant="ghost" class="btn-danger" onclick={remove}><Icon name="delete-02" />Borrar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>
