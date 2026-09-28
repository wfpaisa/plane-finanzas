<!--
  Crear o editar un ahorro: cuánto al mes, la meta, el rendimiento y con
  quién se comparte. En qué cuenta está el dinero lo dice cada movimiento.

  En uno compartido cada persona define su propio aporte (`shares`); el del
  ahorro es la suma.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { monthlyNeeded, today } from "../../lib/finance";
  import { notify } from "../../lib/notify.svelte";
  import { colorOf } from "../../lib/palettes";
  import { pb, session } from "../../lib/pb.svelte";
  import { reload, store } from "../../lib/store.svelte";
  import type { Saving, User } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, ConfirmDialog, DateInput, Field, InfoTip, Input, Modal, Switch, Textarea } from "../ui";
  import IconSelect from "./IconSelect.svelte";
  import Money from "./Money.svelte";
  import MoneyInput from "./MoneyInput.svelte";
  import ColorPicker from "./ColorPicker.svelte";

  let { open, saving = null, onClose }: { open: boolean; saving?: Saving | null; onClose: () => void } = $props();

  let name = $state("");
  let icon = $state("piggy-bank");
  let color = $state("#00bba7");
  let monthly = $state(0);
  let day = $state(1);
  let rate = $state(0);
  let target = $state(0);
  let targetDate = $state("");
  let auto = $state(false);
  let archived = $state(false);
  let notes = $state("");
  let members = $state<User[]>([]);
  let memberEmail = $state("");
  let busy = $state(false);
  let confirmDelete = $state(false);

  const mine = $derived(!saving || saving.owner === session.id);
  const shared = $derived(members.length > 0 || !mine);
  /** Lo que ponen las demás personas que siguen en el ahorro. */
  const others = $derived.by(() => {
    if (!saving || !shared) return [];
    const shares = store.savingShares(saving);
    const ids = [saving.owner, ...members.map((m) => m.id)].filter((id) => id !== session.id);
    const named = (id: string) => {
      const u = members.find((m) => m.id === id);
      return u ? u.name || u.email || "Otra persona" : store.personName(id);
    };
    return ids.map((id) => ({ id, name: named(id), amount: shares[id] ?? 0 }));
  });
  const total = $derived(monthly + others.reduce((a, o) => a + o.amount, 0));

  // Se llena al abrir o al cambiar de saving, y solo entonces: lo demás que
  // lee (cuentas, saldos) va sin seguir, así un cambio en tiempo real no
  // borra lo que se está escribiendo, ni el propio llenado lo vuelve a disparar.
  $effect(() => {
    if (!open) return;
    void saving;
    untrack(() => {
      name = saving?.name ?? "";
      icon = saving?.icon || "piggy-bank";
      color = saving?.palette ? colorOf(saving.palette) : "#00bba7";
      // En uno compartido, solo lo propio: lo de los demás lo define cada quien.
      const isShared = !!saving && (saving.owner !== session.id || !!saving.members?.length);
      monthly = !saving ? 0 : isShared ? (store.savingShares(saving)[session.id] ?? 0) : saving.monthly_amount || 0;
      day = saving?.day_of_month || 1;
      rate = saving?.annual_rate ?? 0;
      target = saving?.target_amount ?? 0;
      targetDate = saving?.target_date?.slice(0, 10) ?? "";
      auto = saving?.auto ?? false;
      archived = saving?.archived ?? false;
      notes = saving?.notes ?? "";
      members = [...(saving?.expand?.members ?? [])];
      memberEmail = "";
    });
  });

  const current = $derived(saving ? store.savingCurrent(saving.id) : 0);
  const monthsLeft = $derived.by(() => {
    if (!targetDate) return 0;
    const [ty, tm] = targetDate.split("-").map(Number);
    const [ny, nm] = today().split("-").map(Number);
    return (ty - ny) * 12 + (tm - nm);
  });
  const needed = $derived(target && monthsLeft > 0 ? monthlyNeeded(current, rate, target, monthsLeft) : 0);

  /**
   * El reparto que se guarda: lo último de los demás (pudieron cambiarlo
   * mientras este formulario estaba abierto), lo propio, y nadie que ya no esté.
   */
  async function sharesToSave(): Promise<Record<string, number>> {
    const fresh = saving ? await pb.collection("savings").getOne<Saving>(saving.id) : null;
    const owner = saving?.owner ?? session.id;
    const keep = new Set([owner, ...members.map((m) => m.id)]);
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(fresh ? store.savingShares(fresh) : {})) if (keep.has(id) && v > 0) out[id] = v;
    if (monthly > 0) out[session.id] = monthly;
    else delete out[session.id];
    return out;
  }

  async function addMember() {
    const email = memberEmail.trim();
    if (!email) return;
    try {
      const u = await pb.send<User>("/api/finanzas/users/lookup", { query: { email } });
      if (u.id === session.id) throw new Error("Ese eres tú.");
      if (!members.some((m) => m.id === u.id)) members = [...members, u];
      memberEmail = "";
    } catch (err) {
      notify.fail(err);
    }
  }

  async function save() {
    if (!name.trim()) return notify.fail(new Error("Ponle nombre al ahorro."));
    busy = true;
    try {
      const shares = shared ? await sharesToSave() : {};
      const data: Record<string, unknown> = {
        name: name.trim(),
        icon,
        palette: color,
        monthly_amount: shared ? Object.values(shares).reduce((a, v) => a + v, 0) : monthly,
        shares,
        day_of_month: day,
        annual_rate: rate,
        target_amount: target,
        target_date: targetDate ? `${targetDate} 12:00:00.000Z` : "",
        // Ya no se usa: la cuenta la dice cada movimiento.
        allocations: [],
        auto,
        archived,
        notes,
      };
      // Con quién se comparte lo decide solo el dueño: si lo manda otro, no se guarda nada.
      if (mine) data.members = members.map((m) => m.id);
      if (saving) await pb.collection("savings").update(saving.id, data);
      else await pb.collection("savings").create({ ...data, owner: session.id });
      await reload("savings");
      notify.done("Ahorro guardado");
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!saving) return;
    busy = true;
    try {
      await pb.collection("savings").delete(saving.id);
      await reload("savings");
      confirmDelete = false;
      onClose();
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} {onClose} title={saving ? "Editar ahorro" : "Nuevo ahorro"} width="modal-panel-width-lg">
  <div class="saving-form">
    <div class="form-grid">
      <Field label="Nombre" tip="El objetivo para el que guardas dinero. Así aparecerá en Ahorros, Resumen y Proyección."><Input bind:value={name} placeholder="Viajes, imprevistos, vejez…" autofocus /></Field>
      {#if shared}
        <Field label="Tu aporte al mes" tip="Lo que pones tú cada mes, desde tus cuentas. Cada persona define el suyo y el aporte del ahorro es la suma. Solo tu parte deja de contarse como dinero disponible."><MoneyInput bind:value={monthly} /></Field>
      {:else}
        <Field label="Cuánto guardarás al mes" tip="Esta cantidad se reserva cada mes y deja de contarse como dinero disponible para otros gastos."><MoneyInput bind:value={monthly} /></Field>
      {/if}
      <Field label="Día del aporte" tip="Día del mes en que se registra el aporte automático. Si el mes es más corto, se usa su último día."><Input type="number" min="1" max="31" bind:value={day} /></Field>
      <Field label="Interés anual (%)" tip="El porcentaje que esperas ganar en un año por tener este dinero guardado. Se usa solo para calcular el futuro. Escribe 0 si la cuenta no paga intereses."><Input type="number" min="0" max="100" step="0.1" bind:value={rate} /></Field>
      <Field label="Objetivo de ahorro (opcional)" tip="Cantidad total que deseas ahorrar. La barra mostrará el avance hacia este objetivo."><MoneyInput bind:value={target} /></Field>
      <Field label="Fecha objetivo (opcional)" tip="Fecha en la que deseas completar el ahorro. Con la cantidad y la fecha objetivo, se calcula el aporte mensual necesario."><DateInput bind:value={targetDate} clearable /></Field>
    </div>

    {#if others.length}
      <p class="shares">
        {#each others as o (o.id)}<span>{o.name} <Money value={o.amount} /></span>{/each}
        <span class="shares-total">Entre todos <b><Money value={total} /></b> al mes</span>
      </p>
    {/if}

    {#if needed > 0}
      <p class="hint-box">
        <Icon name="target-01" />Para ahorrar <Money value={target} /> en {monthsLeft} meses, el aporte mensual necesario es
        <b><Money value={needed} /></b>{shared ? " entre todos" : ""}{total >= needed ? ". El aporte definido es suficiente." : "."}
      </p>
    {/if}

    {#if mine}
      <div>
        <p class="eyebrow label-tip">Compartir con otras personas<InfoTip text="Escribe el correo de alguien que ya tenga usuario en la app. Verá este ahorro y podrá aportar desde sus propias cuentas." /></p>
        <div class="members">
          {#each members as m (m.id)}
            <span class="tag tint-2">{m.name || m.email || "Usuario"}
              <button type="button" class="tag-remove" aria-label="Quitar" onclick={() => (members = members.filter((x) => x.id !== m.id))}>
                <Icon name="cancel-01" size={12} />
              </button>
            </span>
          {/each}
        </div>
        <div class="member-add">
          <Input bind:value={memberEmail} type="email" placeholder="correo@de-la-otra-persona.com" />
          <Button onclick={addMember}><Icon name="user-add-01" />Agregar</Button>
        </div>
      </div>
    {/if}

    <div><p class="eyebrow label-tip">Color<InfoTip text="Color del punto que identifica este ahorro en las listas." /></p><ColorPicker bind:value={color} /></div>
    <div><p class="eyebrow label-tip">Icono<InfoTip text="Ícono que acompaña a este ahorro en las listas." /></p><IconSelect bind:value={icon} /></div>
    <Field label="Notas" tip="Texto libre. No cambia ningún cálculo."><Textarea bind:value={notes} rows={2} /></Field>

    <div class="flex flex-wrap gap-5">
      <span class="label-tip">
        <Switch bind:checked={auto} label="Aportar automáticamente" />
        <InfoTip text={shared ? "En el día elegido, la aplicación registrará el aporte de cada persona, en la cuenta de su último aporte. El proceso se ejecuta diariamente a las 6:00 a. m. y no mueve dinero en el banco." : "En el día elegido, la aplicación registrará esta cantidad como ahorro, en la cuenta de tu último aporte. El proceso se ejecuta diariamente a las 6:00 a. m. y no mueve dinero en el banco."} />
      </span>
      {#if saving}
        <span class="label-tip">
          <Switch bind:checked={archived} label="Archivado" />
          <InfoTip text="Lo oculta de las listas y de la proyección. También deja de crear aportes automáticos, pero conserva todo el historial." />
        </span>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    {#if saving && mine}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Eliminar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={onClose}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={save}>Guardar</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Eliminar ahorro"
  message="Se eliminarán los aportes registrados en este ahorro. El saldo de las cuentas no cambiará. Esta acción no se puede deshacer."
  {busy}
  onConfirm={remove}
/>

<style>
  .label-tip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .saving-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }

  .hint-box {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: var(--sp-10) var(--sp-12);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--accent-soft-text);
    font-size: var(--text-sm);
  }

  /* El aporte de los demás y el de todos, debajo del propio. */
  .shares {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4) var(--sp-16);
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .shares-total {
    margin-left: auto;
  }

  .members {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    margin-bottom: var(--sp-8);

    &:empty {
      display: none;
    }
  }

  .member-add {
    display: flex;
    gap: var(--sp-8);
    margin-bottom: var(--sp-4);
  }
</style>
