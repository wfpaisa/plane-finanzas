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
  import { Button, DateInput, Field, Input, Modal, Select, Switch, WarnNote } from "../ui";
  import AccountSelect from "./AccountSelect.svelte";
  import Money from "./Money.svelte";
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
  /** Apartarlo mes a mes (una provisión): solo para gastos anuales o de una vez. */
  let reserve = $state(false);
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
      reserve = !!provision(item);
    });
  });

  const cats = $derived(store.categories.filter((c) => c.kind === kind));
  const knownTags = $derived([...new Set(["fijo", ...store.categories.flatMap((c) => c.tags ?? [])])]);
  const dayless = $derived(frequency !== "once" && !day);
  const canReserve = $derived(kind === "expense" && frequency !== "monthly");

  /** La provisión de un fijo, si tiene. */
  function provision(r: Recurring | null) {
    const sv = r?.saving ? store.saving(r.saving) : undefined;
    return sv?.kind === "provision" ? sv : undefined;
  }
  const saved = $derived(item && provision(item) ? store.savingCurrent(item.saving!) : 0);

  /** Crea o pone al día la provisión; devuelve su id. */
  async function saveProvision(): Promise<string> {
    const data = {
      owner: session.id,
      name: name.trim(),
      icon: "piggy-bank",
      kind: "provision",
      target_amount: amount,
      monthly_amount: Math.round(amount / 12),
      auto: false,
      archived: false,
    };
    const sv = provision(item);
    if (sv) {
      await pb.collection("savings").update(sv.id, data);
      return sv.id;
    }
    return (await pb.collection("savings").create(data)).id;
  }

  async function save() {
    if (!name.trim() || !amount) return notify.fail(new Error("Escribe un nombre y un monto."));
    if (kind === "transfer" && toAccount && toAccount === account)
      return notify.fail(new Error("Elige una cuenta de destino distinta."));
    if (auto && !account) return notify.fail(new Error("Selecciona una cuenta para crear el movimiento automáticamente."));
    if (auto && kind === "transfer" && !toAccount)
      return notify.fail(new Error("Selecciona la cuenta de destino para crear la transferencia automáticamente."));
    if (auto && dayless) return notify.fail(new Error("Escribe el día del mes para crear el movimiento automáticamente."));
    const keep = reserve && canReserve;
    if (keep && !account) return notify.fail(new Error("Elige la cuenta en la que separarás el dinero."));
    busy = true;
    try {
      const old = provision(item);
      const saving = keep ? await saveProvision() : "";
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
        saving,
        paused,
        auto_create: auto,
      };
      if (item) await pb.collection("recurring").update(item.id, data);
      else await pb.collection("recurring").create(data);
      // Sin provisión, lo apartado se va con ella.
      if (old && !keep) await pb.collection("savings").delete(old.id);
      await reload("recurring", "savings");
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
      // El servidor borra también su provisión (ver pb_hooks/main.pb.js).
      await pb.collection("recurring").delete(item.id);
      await reload("recurring", "savings");
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
    ? item.kind === "income"
      ? "Editar ingreso programado"
      : item.kind === "transfer"
        ? "Editar transferencia programada"
        : "Editar gasto programado"
    : kind === "income"
      ? "Nuevo ingreso programado"
      : kind === "transfer"
        ? "Nueva transferencia programada"
        : "Nuevo gasto programado"}
>
  <div class="stack">
    <Segmented bind:value={kind} full options={TX_TYPES} label="Tipo" />
    <div class="form-grid">
      <Field label="Nombre" tip="Un nombre que te permita identificarlo en la proyección."><Input bind:value={name} placeholder={kind === "income" ? "Sueldo" : kind === "transfer" ? "Aporte a inversión" : "Crédito hipotecario"} autofocus /></Field>
      <Field label="Monto" tip={kind === "income" ? "Cuánto esperas recibir cada vez." : kind === "transfer" ? "Cuánto transferirás cada vez." : "Cuánto esperas pagar cada vez."}><MoneyInput bind:value={amount} /></Field>
    </div>
    <section class="rf-group">
      <h4 class="eyebrow">{kind === "income" ? "Cuándo lo recibes" : kind === "transfer" ? "Cuándo harás la transferencia" : "Cuándo debes pagarlo"}</h4>
      <div class="form-grid">
        <Field label="Frecuencia" tip="Indica si ocurre cada mes, una vez al año o solo una vez.">
          <Select bind:value={frequency}>
            {#each FREQUENCIES as f (f.id)}<option value={f.id}>{f.label}</option>{/each}
          </Select>
        </Field>
        {#if frequency === "yearly"}
          <Field label={kind === "income" ? "Mes del ingreso" : kind === "transfer" ? "Mes de la transferencia" : "Mes del pago"} tip={kind === "income" ? "Mes del año en que esperas recibirlo." : kind === "transfer" ? "Mes del año en que harás la transferencia." : "Mes del año en que debes pagarlo."}>
            <Select bind:value={month}>
              {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<option value={m}>{monthName(m)}</option>{/each}
            </Select>
          </Field>
        {/if}
        {#if frequency === "once"}
          <Field label="Fecha programada" tip={kind === "income" ? "Fecha en la que esperas recibir el ingreso." : kind === "transfer" ? "Fecha en la que harás la transferencia." : "Fecha en la que debes hacer el pago."}><DateInput bind:value={start} /></Field>
        {:else}
          <Field label="Día del mes (opcional)" tip={kind === "income" ? "Día en que esperas recibirlo. Si no eliges uno, podrás registrarlo en cualquier fecha." : kind === "transfer" ? "Día en que harás la transferencia. Si no eliges uno, podrás registrarla en cualquier fecha." : "Día en que debes pagarlo. Si no eliges uno, podrás registrarlo en cualquier fecha."}>
            <Input type="number" min="1" max="31" bind:value={day} placeholder="Sin día fijo" />
          </Field>
        {/if}
      </div>
    </section>
    <div class="form-grid">
      {#if kind === "transfer"}
        <Field label="Cuenta de origen" tip="Cuenta de la que saldrá el dinero."><AccountSelect bind:value={account} placeholder="Elegir al registrar" /></Field>
        <Field label="Cuenta de destino" tip="Cuenta a la que llegará el dinero."><AccountSelect bind:value={toAccount} placeholder="Elegir al registrar" exclude={account} /></Field>
      {:else}
        <Field label="Categoría" tip="Para agruparlo en los informes.">
          <Select bind:value={category}>
            <option value="">Sin categoría</option>
            {#each cats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </Select>
        </Field>
        <Field label="Cuenta" tip={kind === "income" ? "Cuenta en la que recibirás el dinero." : "Cuenta desde la que harás el pago."}><AccountSelect bind:value={account} placeholder="Elegir al registrar" /></Field>
      {/if}
    </div>
    {#if frequency !== "once"}
      <section class="rf-group">
        <h4 class="eyebrow">Periodo en que se repite (opcional)</h4>
        <div class="form-grid">
          <Field label="Fecha de inicio" tip="Antes de esta fecha no aparecerá en la proyección. Si la dejas vacía, aparecerá en todos los meses."><DateInput bind:value={start} clearable /></Field>
          <Field label="Fecha de finalización" tip="Después de esta fecha dejará de aparecer, por ejemplo tras la última cuota de un crédito. Si la dejas vacía, se repetirá sin fecha de fin."><DateInput bind:value={end} clearable /></Field>
        </div>
      </section>
    {/if}
    <Field label="Etiquetas" tip="Cada movimiento creado incluirá estas etiquetas y la etiqueta #fijo."><TagInput bind:value={tags} suggestions={knownTags} /></Field>
    <div class="flex flex-wrap gap-5">
      <Switch bind:checked={auto} label="Registrar automáticamente" />
      {#if canReserve}<Switch bind:checked={reserve} label="Separar dinero cada mes" />{/if}
      <Switch bind:checked={paused} label="Pausar esta programación" />
    </div>
    {#if canReserve && reserve}
      <p class="small muted">
        Cada mes verás cuánto debes separar para completar este pago a tiempo. El dinero no se mueve de la cuenta:
        solo se muestra como reservado hasta que registres el pago.
        {#if saved > 0}Ya tienes <Money value={saved} /> reservado.{/if}
      </p>
    {:else if canReserve && provision(item) && saved > 0}
      <WarnNote>Si guardas con esta opción desactivada, dejarán de aparecer como reservados <Money value={saved} />.</WarnNote>
    {/if}
    {#if auto}
      <p class="small muted">
        La aplicación creará este movimiento según la frecuencia y la fecha indicadas. No hará operaciones en tu banco. Desactiva esta opción si el movimiento ya se registra desde Gmail para evitar duplicados.
      </p>
    {/if}
  </div>
  {#snippet footer()}
    {#if item}
      <Button variant="ghost" class="btn-danger" onclick={remove}><Icon name="delete-02" />Eliminar programación</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>{item ? "Guardar cambios" : "Crear programación"}</Button>
  {/snippet}
</Modal>

<style>
  .rf-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding-top: var(--sp-14);
    border-top: var(--border-width) solid var(--border);

    & h4 {
      margin: 0;
    }
  }
</style>
