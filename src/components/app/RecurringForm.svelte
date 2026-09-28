<!--
  Un fijo: el sueldo, la cuota del crédito, la administración, el predial…
  Lleva lo que necesita su movimiento, que se crea al marcarlo como pagado
  en la proyección (o solo, si es automático).
-->
<script lang="ts">
  import { untrack } from "svelte";

  import type { TxType } from "../../lib/finance";
  import { monthName } from "../../lib/format";
  import { FREQUENCIES, TX_TYPES } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Recurring } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, DateInput, Field, Input, Modal, Select, Switch } from "../ui";
  import AccountSelect from "./AccountSelect.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import Segmented from "./Segmented.svelte";
  import TagInput from "./TagInput.svelte";

  let {
    open,
    item = null,
    kind: presetKind = "expense",
    onClose,
  }: { open: boolean; item?: Recurring | null; kind?: TxType; onClose: () => void } = $props();

  let kind = $state<TxType>("expense");
  let name = $state("");
  let amount = $state(0);
  let frequency = $state<"monthly" | "yearly" | "once">("monthly");
  /** `null`: sin día fijo. */
  let day = $state<number | null>(null);
  let month = $state(1);
  let start = $state("");
  let end = $state("");
  let category = $state("");
  let account = $state("");
  let toAccount = $state("");
  let tags = $state<string[]>([]);
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
      day = item ? item.day_of_month || null : null;
      month = item?.month || 1;
      start = item?.start_date?.slice(0, 10) ?? "";
      end = item?.end_date?.slice(0, 10) ?? "";
      category = item?.category ?? "";
      account = item?.account ?? "";
      toAccount = item?.to_account ?? "";
      tags = [...(item?.tags ?? [])];
      paused = item?.paused ?? false;
      auto = item?.auto_create ?? false;
    });
  });

  const cats = $derived(store.categories.filter((c) => c.kind === kind));
  const knownTags = $derived([...new Set(["fijo", ...store.categories.flatMap((c) => c.tags ?? [])])]);
  const dayless = $derived(frequency !== "once" && !day);

  async function save() {
    if (!name.trim() || !amount) return notify.fail(new Error("Escribe un nombre y una cantidad."));
    if (kind === "transfer" && toAccount && toAccount === account)
      return notify.fail(new Error("Elige una cuenta de destino distinta."));
    if (auto && !account) return notify.fail(new Error("Selecciona una cuenta para crear el movimiento automáticamente."));
    if (auto && kind === "transfer" && !toAccount)
      return notify.fail(new Error("Selecciona la cuenta de destino para crear la transferencia automáticamente."));
    if (auto && dayless) return notify.fail(new Error("Escribe el día del mes para crear el movimiento automáticamente."));
    busy = true;
    try {
      const data = {
        owner: session.id,
        kind,
        name: name.trim(),
        amount,
        frequency,
        day_of_month: frequency === "once" ? 0 : Math.min(31, Math.max(0, Math.round(day ?? 0))),
        month,
        start_date: start ? `${start} 12:00:00.000Z` : "",
        end_date: end ? `${end} 12:00:00.000Z` : "",
        category: kind === "transfer" ? "" : category,
        account,
        to_account: kind === "transfer" ? toAccount : "",
        tags,
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

<Modal
  {open}
  {onClose}
  title={item
    ? "Editar movimiento recurrente"
    : kind === "income"
      ? "Nuevo ingreso recurrente"
      : kind === "transfer"
        ? "Nueva transferencia recurrente"
        : "Nuevo gasto recurrente"}
>
  <div class="stack">
    <Segmented bind:value={kind} full options={TX_TYPES} label="Tipo" />
    <div class="form-grid">
      <Field label="Nombre"><Input bind:value={name} placeholder="Crédito hipotecario" autofocus /></Field>
      <Field label="Monto"><MoneyInput bind:value={amount} /></Field>
      <Field label="Cada cuánto ocurre">
        <Select bind:value={frequency}>
          {#each FREQUENCIES as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
        </Select>
      </Field>
      {#if frequency === "once"}
        <Field label="Fecha"><DateInput bind:value={start} /></Field>
      {:else}
        <Field label="Día del mes (opcional)" hint={dayless ? "Sin día, lo marcas cuando lo pagues y queda con esa fecha." : ""}>
          <Input type="number" min="1" max="31" bind:value={day} placeholder="Sin día fijo" />
        </Field>
      {/if}
      {#if frequency === "yearly"}
        <Field label="Mes">
          <Select bind:value={month}>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<option value={m}>{monthName(m)}</option>{/each}
          </Select>
        </Field>
      {/if}
      {#if kind === "transfer"}
        <Field label="Cuenta de origen"><AccountSelect bind:value={account} placeholder="Elígela al pagar" /></Field>
        <Field label="Cuenta de destino"><AccountSelect bind:value={toAccount} placeholder="Elígela al pagar" exclude={account} /></Field>
      {:else}
        <Field label="Categoría">
          <Select bind:value={category}>
            <option value="">Sin categoría</option>
            {#each cats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </Select>
        </Field>
        <Field label="Cuenta"><AccountSelect bind:value={account} placeholder="Elígela al pagar" /></Field>
      {/if}
      {#if frequency !== "once"}
        <Field label="Desde (opcional)"><DateInput bind:value={start} clearable /></Field>
        <Field label="Hasta (opcional)" hint="Ej: la última cuota del crédito"><DateInput bind:value={end} clearable /></Field>
      {/if}
    </div>
    <Field label="Etiquetas" hint="El movimiento lleva también #fijo."><TagInput bind:value={tags} suggestions={knownTags} /></Field>
    <div class="flex flex-wrap gap-5">
      <Switch bind:checked={auto} label="Se paga solo (débito automático)" />
      <Switch bind:checked={paused} label="Pausar este movimiento" />
    </div>
    {#if auto}
      <p class="small muted">
        Para lo que el banco paga solo en una fecha: la aplicación lo marca como pagado y crea el movimiento cada {frequency === "yearly" ? "año" : "mes"}, el día indicado. No mueve dinero en el banco. Si Gmail ya registra este movimiento, desactiva esta opción para evitar duplicados.
      </p>
    {/if}
  </div>
  {#snippet footer()}
    {#if item}
      <Button variant="ghost" class="btn-danger" onclick={remove}><Icon name="delete-02" />Eliminar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>
