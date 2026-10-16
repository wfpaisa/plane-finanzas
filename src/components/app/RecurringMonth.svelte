<!--
  Lo que toca pagar (y recibir) en un mes: los fijos que caen en él, con lo
  ya pagado y lo que falta. Su círculo lo marca de una vez: registra el
  movimiento con los datos del fijo, y al desmarcarlo lo elimina (o, si era
  uno que ya existía, solo lo suelta). Tocar la fila de uno pendiente abre su
  movimiento ya llenado, para cambiarlo antes de guardarlo; la de uno pagado
  lo abre para verlo o editarlo. Los fijos se editan en el plan, abajo.

  El movimiento queda unido al fijo por su marca (`recurringKey`), la misma
  que usa el programador para los automáticos: así no se repiten. Si el pago
  ya está registrado, se propone usar ese movimiento: queda unido por
  `recurring_key` (ver pb_hooks/lib/plan.js). Lo marcado
  en el mes sale siempre, aunque su fijo ya no toque (pausado, terminado,
  cambiado o borrado).

  Un fijo con provisión (el predial) trae además, cada mes, lo que toca
  apartar para pagarlo: marcarlo abre el formulario del aporte a su ahorro,
  sin mover plata. En el mes en curso avisa lo que quedó sin reservar. Al pagarlo, el servidor libera lo apartado (pb_hooks/lib/provisions.js).

  Con `mobile` (Gastos e ingresos en el celular) el título lo pone la página, el
  movimiento se abre en la pantalla del celular (mobile/TxScreen) y el botón
  de atrás del teléfono cierra lo que esté abierto.
-->
<script lang="ts">
  import { dueDate, lastDayOf, monthRange, nextDueMonth, recurringKey, reserveMonths, today } from "../../lib/finance";
  import { dateShort, monthLabel } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { cachedList, offline } from "../../lib/offline.svelte";
  import { overlay, type Pending } from "../../lib/outbox";
  import { pb, session } from "../../lib/pb.svelte";
  import { closeOnBack } from "../../lib/router.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import { recurringTags } from "../../lib/tags";
  import type { Recurring, Saving, SavingMovement, Transaction, TxDraft } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button, Modal } from "../ui";
  import MonthNav from "../mobile/MonthNav.svelte";
  import TxScreen from "../mobile/TxScreen.svelte";
  import Money from "./Money.svelte";
  import MovementForm from "./MovementForm.svelte";
  import TransactionForm from "./TransactionForm.svelte";

  const now = today();

  /** `ym`: el mes que se ve ("AAAA-MM"); quien lo enlaza sigue al mes elegido aquí. */
  let { mobile = false, ym = $bindable(now.slice(0, 7)) }: { mobile?: boolean; ym?: string } = $props();

  interface Due {
    r: Recurring;
    /** El día que toca; `null` si no tiene día fijo. */
    date: string | null;
    key: string;
    /** Marcado cuando su fijo ya se borró: `r` sale del movimiento. */
    orphan?: boolean;
  }

  const due = $derived(
    store.recurring
      .filter((r) => !r.paused)
      .flatMap((r): Due[] => {
        const d = dueDate(r, ym);
        return d ? [{ r, date: d.length === 10 ? d : null, key: recurringKey(r, ym) }] : [];
      })
      // Por día; los que no tienen día, al final.
      .toSorted((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || a.r.name.localeCompare(b.r.name)),
  );
  const keys = $derived(due.map((d) => d.key));

  /** La marca de pago de un movimiento: la que le puso la app o la de uno que ya existía y se unió. */
  const keyOf = (t: Pick<Transaction, "external_id" | "recurring_key">) => t.recurring_key || t.external_id || "";

  /** De qué mes es un movimiento marcado: el de su marca, si es mensual; si no, el de su fecha. */
  function keyMonth(t: Pick<Transaction, "external_id" | "recurring_key" | "date">) {
    const s = keyOf(t).split(":")[2] ?? "";
    return s.length === 7 ? s : t.date.slice(0, 7);
  }

  let serverTxs = $state<Transaction[]>([]);
  let loading = $state(true);

  $effect(() => {
    void store.txVersion;
    const list = keys;
    const [from, to] = monthRange(ym);
    let alive = true;
    // Los que tocan este mes, más todo lo marcado de este mes: por la marca
    // (los mensuales) o por la fecha (los anuales y los de una vez).
    const params: Record<string, string> = { pat: `rec:%:${ym}`, from, to };
    list.forEach((k, i) => (params[`k${i}`] = k));
    const filter = pb.filter(
      [
        "external_id ~ {:pat}",
        "recurring_key ~ {:pat}",
        "(external_id ~ 'rec:%' && date >= {:from} && date < {:to})",
        "(recurring_key != '' && date >= {:from} && date < {:to})",
        ...list.map((_, i) => `external_id = {:k${i}} || recurring_key = {:k${i}}`),
      ].join(" || "),
      params,
    );
    loading = true;
    cachedList(
      `rec:${ym}`,
      () => pb.collection("transactions").getFullList<Transaction>({ filter, sort: "-date", batch: 500 }),
      (r) => alive && (serverTxs = r),
    )
      .catch(notify.fail)
      .finally(() => alive && (loading = false));
    return () => (alive = false);
  });

  // Encima, lo que falta por enviar: lo marcado sin conexión ya cuenta.
  const paid = $derived.by(() => {
    const set = new Set(keys);
    const map = new Map<string, Pending<Transaction>>();
    const mine = (t: Transaction) => set.has(keyOf(t)) || (keyOf(t).startsWith("rec:") && keyMonth(t) === ym);
    for (const t of overlay("transactions", serverTxs, offline.items, mine)) map.set(keyOf(t), t);
    return map;
  });

  /** Lo marcado cuyo fijo ya no toca este mes, con su fijo si aún existe. */
  const extra = $derived.by(() => {
    const set = new Set(keys);
    return [...paid.values()]
      .filter((t) => !set.has(keyOf(t)))
      .map((t): Due => {
        const r = store.recurring.find((x) => x.id === keyOf(t).split(":")[1]);
        const fake = { id: "", name: t.description || "Programación eliminada", kind: t.type, amount: t.amount, category: t.category } as Recurring;
        return { r: r ?? fake, date: t.date.slice(0, 10), key: keyOf(t), orphan: !r };
      });
  });

  const rows = $derived(
    [...due, ...extra].toSorted((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || a.r.name.localeCompare(b.r.name)),
  );

  // Los gastos (con las transferencias, que también son pagos) y los ingresos, cada uno en su lista.
  const groups = $derived(
    [
      { id: "out", title: "Pagos y transferencias", items: rows.filter((d) => d.r.kind !== "income"), left: "por pagar" },
      { id: "in", title: "Ingresos", items: rows.filter((d) => d.r.kind === "income"), left: "por recibir" },
    ].filter((g) => g.items.length),
  );

  // ---- Lo que toca apartar este mes para las provisiones ----

  interface Reserve {
    r: Recurring;
    saving: Saving;
    key: string;
    /** El aporte de este mes, si ya se marcó. */
    mv?: SavingMovement;
    /** Lo que toca apartar: lo que falta, repartido en los meses que quedan. */
    quota: number;
    /** El mes del pago. */
    due: string;
    /** En el mes en curso: los meses anteriores del ciclo sin reservar y lo que falta para ir al día. */
    missed: number;
    behind: number;
  }

  /** La provisión de un fijo, si tiene. */
  const provisionOf = (r: Recurring) => {
    const sv = r.saving ? store.saving(r.saving) : undefined;
    return sv?.kind === "provision" ? sv : undefined;
  };

  const reserves = $derived(
    store.recurring
      .filter((r) => !r.paused && r.kind === "expense")
      .flatMap((r): Reserve[] => {
        const saving = provisionOf(r);
        if (!saving) return [];
        // Se aparta desde el "Desde" del fijo; sin él, desde que se creó la provisión.
        const plan = reserveMonths(r, ym, (r.start_date || saving.created).slice(0, 7));
        if (!plan) return [];
        const prefix = `prov:${r.id}:`;
        const marks = new Map(
          store.movements.filter((m) => m.saving === saving.id && m.external_id?.startsWith(prefix)).map((m) => [m.external_id!.slice(prefix.length), m]),
        );
        const key = prefix + ym;
        const mv = marks.get(ym);
        // En el mes del pago, una vez pagado ya no hay nada que apartar.
        if (!mv && ym === plan.due && paid.has(recurringKey(r, ym))) return [];
        // Si el ciclo es solo el mes del pago, no hay meses antes para ir apartando.
        if (!mv && plan.months.length < 2) return [];
        // Cada mes, la parte pareja del ciclo; en el ciclo de hoy, nunca más de lo que falta.
        const share = Math.ceil(r.amount / plan.months.length);
        const thisMonth = now.slice(0, 7);
        const live = plan.due === nextDueMonth(r, thisMonth);
        const saved = store.savingCurrent(saving.id);
        const quota = live ? Math.min(share, Math.max(0, r.amount - saved)) : share;
        if (!mv && quota <= 0) return [];
        const idx = plan.months.indexOf(ym);
        // Un mes pasado del ciclo de hoy que ya quedó cubierto (por ejemplo, al reservar
        // lo atrasado de una vez) no pide nada.
        if (!mv && live && ym < thisMonth && saved >= Math.min(r.amount, share * (idx + 1))) return [];
        // En el mes en curso, lo que quedó sin reservar en los meses anteriores.
        let missed = 0;
        let behind = 0;
        if (!mv && live && ym === thisMonth) {
          missed = plan.months.filter((m) => m < ym && !marks.has(m)).length;
          behind = missed ? Math.max(0, Math.min(r.amount, share * idx) - saved) : 0;
          if (!behind) missed = 0;
        }
        return [{ r, saving, key, mv, quota, due: plan.due, missed, behind }];
      })
      .toSorted((a, b) => a.due.localeCompare(b.due) || a.r.name.localeCompare(b.r.name)),
  );

  // Reservar siempre pasa por el formulario, ya llenado con la cuota del mes (o con
  // todo lo atrasado); uno ya reservado se corrige (o se borra) en el mismo formulario.
  let mvOpen = $state(false);
  let mvSaving = $state<Saving | null>(null);
  let mvEdit = $state<SavingMovement | null>(null);
  let mvDraft = $state<{ amount: number; date: string; account: string; note: string; external_id: string } | null>(null);
  let mvTitle = $state("");

  function openReserve(x: Reserve, amount = x.quota) {
    mvSaving = x.saving;
    mvEdit = x.mv ?? null;
    mvDraft = x.mv
      ? null
      : { amount, date: dateFor({ r: x.r, date: null, key: x.key }), account: x.r.account, note: "Dinero reservado", external_id: x.key };
    mvTitle = `${x.mv ? "Dinero reservado para" : "Reservar dinero para"} ${x.r.name}`;
    mvOpen = true;
  }

  const done = $derived(rows.filter((d) => paid.has(d.key)).length + reserves.filter((x) => x.mv).length);
  const total = $derived(rows.length + reserves.length);

  /** Sin día fijo, la fecha es hoy si cae en el mes; si no, su primer o último día. */
  function dateFor(d: Due) {
    if (d.date) return d.date;
    if (now.slice(0, 7) === ym) return now;
    return ym < now ? `${ym}-${String(lastDayOf(ym)).padStart(2, "0")}` : `${ym}-01`;
  }

  /** Lo pagado en el mes actual se registra hoy, el día en que se marca; en otro mes, en su fecha programada. */
  function paidDate(d: Due) {
    return now.slice(0, 7) === ym ? now : dateFor(d);
  }

  function draftOf(d: Due): TxDraft {
    const r = d.r;
    return {
      type: r.kind,
      amount: r.amount,
      date: paidDate(d),
      account: r.account,
      to_account: r.kind === "transfer" ? r.to_account : "",
      category: r.kind === "transfer" ? "" : r.category,
      description: r.name,
      notes: "",
      tags: recurringTags(r.tags),
    };
  }

  // El formulario: un movimiento pagado (para editarlo) o uno por pagar.
  let formOpen = $state(false);
  let editTx = $state<Transaction | null>(null);
  let draft = $state<TxDraft | null>(null);
  let link = $state<{ external_id: string } | null>(null);

  function open(d: Due) {
    const tx = paid.get(d.key);
    editTx = tx ?? null;
    draft = tx ? null : draftOf(d);
    link = tx ? null : { external_id: d.key };
    formOpen = true;
  }

  // ---- El check: registrar o quitar el movimiento, sin formulario ----

  let busy = $state(new Set<string>());

  /**
   * Marcar registra el movimiento de una vez, con los datos del programado.
   * Desmarcar lo elimina; si era un movimiento que ya existía y se unió, solo
   * se le quita la marca y se conserva.
   */
  async function toggle(d: Due) {
    if (busy.has(d.key)) return;
    busy = new Set(busy).add(d.key);
    const tx = paid.get(d.key);
    const income = d.r.kind === "income";
    try {
      if (!tx) {
        const x = draftOf(d);
        await offline.create("transactions", {
          owner: session.id,
          type: x.type,
          amount: x.amount,
          date: `${x.date} 12:00:00.000Z`,
          account: x.account,
          to_account: x.to_account,
          category: x.category,
          description: x.description,
          notes: x.notes,
          tags: x.tags,
          source: "recurrente",
          external_id: d.key,
        });
        notify.done(
          !offline.online
            ? `${d.r.name} quedó ${income ? "recibido" : "pagado"} sin conexión. El movimiento se enviará al reconectar.`
            : `${d.r.name} quedó ${income ? "recibido" : "pagado"}. Se registró el movimiento del ${dateShort(x.date)}.`,
        );
      } else if (tx.recurring_key) {
        if (d.orphan) return open(d);
        await pb.send("/api/finanzas/recurring/mark", { method: "POST", body: { recurring: d.r.id, ym, unlink: true } });
        notify.done(`${d.r.name} volvió a quedar pendiente. El movimiento que ya tenías se conserva.`);
        touchTransactions();
      } else {
        await offline.remove("transactions", tx.id, tx);
        notify.done(`${d.r.name} volvió a quedar pendiente. Se eliminó su movimiento.`);
      }
    } catch (err) {
      notify.fail(err);
    } finally {
      const next = new Set(busy);
      next.delete(d.key);
      busy = next;
    }
  }

  // ---- Un pago que ya está registrado ----

  interface Candidate {
    id: string;
    date: string;
    amount: number;
    description: string;
    account_name: string;
    source: string;
  }

  let pickFor = $state<Due | null>(null);
  let candidates = $state<Candidate[]>([]);
  let picking = $state(false);

  /**
   * Marcar uno pendiente: si ya hay movimientos que se parecen (mismo tipo,
   * monto parecido, cerca de la fecha), se ofrece usar uno de ellos en vez de
   * registrar otro. Sin conexión, o sin parecidos, abre el formulario.
   */
  async function mark(d: Due) {
    if (paid.get(d.key) || d.orphan || !offline.online) return open(d);
    try {
      const res = await pb.send<{ items: { key: string; candidates: Candidate[] }[] }>("/api/finanzas/plan", {
        query: { ym, recurring: d.r.id, months: 0 },
      });
      candidates = res.items.find((i) => i.key === d.key)?.candidates ?? [];
    } catch {
      candidates = [];
    }
    if (!candidates.length) return open(d);
    pickFor = d;
  }

  async function useExisting(c: Candidate) {
    if (!pickFor) return;
    picking = true;
    try {
      await pb.send("/api/finanzas/recurring/mark", { method: "POST", body: { recurring: pickFor.r.id, ym, transaction: c.id } });
      notify.done(`${pickFor.r.name} quedó ${pickFor.r.kind === "income" ? "recibido" : "pagado"} con el movimiento que ya tenías.`);
      touchTransactions();
      pickFor = null;
    } catch (err) {
      notify.fail(err);
    } finally {
      picking = false;
    }
  }

  function registerNew() {
    const d = pickFor;
    pickFor = null;
    if (d) open(d);
  }

  // En el celular, el botón de atrás cierra la ventana abierta en vez de salir de la pantalla.
  $effect(() => {
    if (mobile && pickFor) return closeOnBack(() => (pickFor = null));
  });
  $effect(() => {
    if (mobile && mvOpen) return closeOnBack(() => (mvOpen = false));
  });

  const doneWord = (d: Due) => (d.r.kind === "income" ? "Recibido" : "Pagado");

  function status(d: Due): { text: string; tone?: "late" | "today" } {
    const income = d.r.kind === "income";
    if (!d.date) return { text: "Sin fecha definida para este mes" };
    if (d.r.auto_create && d.date >= now) return { text: `Se registrará automáticamente el ${dateShort(d.date)}` };
    if (d.date < now) return income ? { text: `Pendiente desde el ${dateShort(d.date)}` } : { text: `Pago vencido desde el ${dateShort(d.date)}`, tone: "late" };
    if (d.date === now) return { text: "Hoy", tone: "today" };
    return { text: `${income ? "Ingreso esperado" : "Pago previsto"} para el ${dateShort(d.date)}` };
  }
</script>

{#snippet progress()}
  {#if total}
    {done} de {total} completados
  {:else}
    No hay movimientos programados para {monthLabel(ym, true)}
  {/if}
{/snippet}

<div class="rm" class:mobile>
  {#if mobile}
    <div class="rm-head rm-head-m">
      <MonthNav bind:ym />
      <p class="card-sub">{@render progress()}</p>
    </div>
  {:else}
    <header class="rm-header">
      <div class="rm-heading">
        <h2>Movimientos programados del mes</h2>
        <p class="card-sub">Marca cada uno cuando lo pagues o lo recibas.</p>
      </div>
      <div class="rm-head">
        <MonthNav bind:ym />
        <p class="card-sub">{@render progress()}</p>
      </div>
    </header>
  {/if}

  {#each groups as g (g.id)}
    {@const gDone = g.items.filter((d) => paid.has(d.key)).length}
    {@const gLeft = g.items.filter((d) => !paid.has(d.key)).reduce((a, d) => a + d.r.amount, 0)}
    <section class="card rm-group" class:loading>
      <div class="rm-group-head">
        <h3 class="rm-group-title">{g.title}</h3>
        <span class="rm-group-sum">{gDone} de {g.items.length} completados{#if gLeft} · <Money value={gLeft} /> {g.left}{/if}</span>
      </div>
      {@render groupProgress(gDone, g.items.length, g.title)}
      <ul class="rm-list">
        {#each g.items as d (d.key)}
          {@render item(d)}
        {/each}
      </ul>
    </section>
  {:else}
    {#if !store.recurring.length}
      <p class="card rm-empty">Agrega un ingreso, pago o transferencia programada para organizar este mes.</p>
    {/if}
  {/each}

  {#if reserves.length}
    {@const rDone = reserves.filter((x) => x.mv).length}
    {@const rLeft = reserves.filter((x) => !x.mv).reduce((a, x) => a + x.quota, 0)}
    <section class="card rm-group" class:loading>
      <div class="rm-group-head">
        <h3 class="rm-group-title">Dinero por reservar</h3>
        <span class="rm-group-sum">{rDone} de {reserves.length} reservados{#if rLeft} · <Money value={rLeft} /> pendientes{/if}</span>
      </div>
      {@render groupProgress(rDone, reserves.length, "Dinero por reservar")}
      <ul class="rm-list">
        {#each reserves as x (x.key)}
          {@render reserveItem(x)}
        {/each}
      </ul>
    </section>
  {/if}
</div>

{#snippet groupProgress(count: number, of: number, title: string)}
  <div
    class="rm-bar"
    role="progressbar"
    aria-label="Progreso de {title.toLowerCase()}"
    aria-valuemin={0}
    aria-valuemax={of || 1}
    aria-valuenow={count}
    aria-valuetext="{count} de {of}"
  >
    <span style:width="{of ? (count / of) * 100 : 0}%"></span>
  </div>
{/snippet}

{#snippet reserveItem(x: Reserve)}
  {@const saved = store.savingCurrent(x.saving.id)}
  <li class="rm-row" class:done={!!x.mv}>
    <button
      type="button"
      class="rm-check"
      class:on={!!x.mv}
      aria-label={x.mv ? "Ver dinero reservado" : "Marcar dinero como reservado"}
      data-tip={x.mv ? "Ver dinero reservado" : "Marcar dinero como reservado"}
      onclick={() => openReserve(x)}
    >
      <Icon name={x.mv ? "checkmark-circle-02" : "circle"} size={22} />
    </button>
    <button type="button" class="rm-main" onclick={() => openReserve(x)}>
      <span class="rm-text">
        <span class="rm-name">Reservar para {x.r.name}</span>
        <span class="rm-sub">
          {#if x.mv}
            Reservado el {dateShort(x.mv.date)}
          {:else}
            <Icon name="piggy-bank" /><Money value={saved} /> de <Money value={x.r.amount} /> reservados · pago en {monthLabel(x.due)}
          {/if}
        </span>
      </span>
      <span class="rm-amount"><Money value={x.mv?.amount ?? x.quota} /></span>
    </button>
  </li>
  {#if x.behind}
    <li class="rm-behind">
      <Icon name="alert-circle" />
      <span>
        Llevas {x.missed} {x.missed === 1 ? "mes" : "meses"} sin reservar para {x.r.name}. Faltan <Money value={x.behind} /> para ir al día.
      </span>
      <button type="button" class="btn sm" onclick={() => openReserve(x, x.quota + x.behind)}>
        Reservar <Money value={x.quota + x.behind} copy={false} />
      </button>
    </li>
  {/if}
{/snippet}

{#snippet item(d: Due)}
  {@const tx = paid.get(d.key)}
  {@const st = status(d)}
  {@const label = tx
    ? tx.recurring_key
      ? "Desmarcar sin borrar el movimiento"
      : "Desmarcar y eliminar el movimiento"
    : d.r.kind === "income"
      ? "Marcar como recibido"
      : "Marcar como pagado"}
  <li class="rm-row" class:done={!!tx}>
    <button
      type="button"
      class="rm-check"
      class:on={!!tx}
      aria-label={label}
      data-tip={label}
      disabled={busy.has(d.key)}
      onclick={() => toggle(d)}
    >
      <Icon name={tx ? "checkmark-circle-02" : "circle"} size={22} />
    </button>
    <button type="button" class="rm-main" disabled={busy.has(d.key)} onclick={() => (tx ? open(d) : mark(d))}>
      <span class="rm-text">
        <span class="rm-name">{d.r.name}</span>
        <span class="rm-sub">
          {#if tx}
            {doneWord(d)} el {dateShort(tx.date)}{#if tx.recurring_key} · con un movimiento que ya tenías{/if}{#if tx._pending} · sin enviar{/if}
          {:else}
            <span class={st.tone ? `rm-${st.tone}` : ""}>{st.text}</span>{#if d.r.auto_create}<Icon name="repeat" />{/if}
            {#if provisionOf(d.r) && store.savingCurrent(d.r.saving!) > 0}
              · <Icon name="piggy-bank" /><Money value={store.savingCurrent(d.r.saving!)} /> reservados
            {/if}
          {/if}
        </span>
      </span>
      <span class="rm-amount"><Money value={tx?.amount ?? d.r.amount} tone={d.r.kind} /></span>
    </button>
  </li>
{/snippet}

<Modal
  open={!!pickFor}
  onClose={() => (pickFor = null)}
  title={pickFor ? `Marcar ${pickFor.r.name} como ${pickFor.r.kind === "income" ? "recibido" : "pagado"}` : ""}
>
  <p class="rm-pick-note">
    Estos movimientos se parecen a este {pickFor?.r.kind === "income" ? "ingreso" : "pago"}. Si alguno es el mismo, úsalo para no registrarlo dos
    veces.
  </p>
  <ul class="rm-pick">
    {#each candidates as c (c.id)}
      <li>
        <span class="rm-text">
          <span class="rm-name">{c.description || "Sin descripción"}</span>
          <span class="rm-sub">{dateShort(c.date)}{#if c.account_name} · {c.account_name}{/if}</span>
        </span>
        <span class="rm-amount"><Money value={c.amount} /></span>
        <Button size="sm" loading={picking} onclick={() => useExisting(c)}>Usar este movimiento</Button>
      </li>
    {/each}
  </ul>
  {#snippet footer()}
    <Button onclick={() => (pickFor = null)}>Cancelar</Button>
    <Button variant="secondary" onclick={registerNew}>Registrar movimiento nuevo</Button>
  {/snippet}
</Modal>

{#if mobile}
  <TxScreen
    open={formOpen}
    tx={editTx}
    {draft}
    {link}
    title={link ? (draft?.type === "income" ? "Marcar como recibido" : "Marcar como pagado") : undefined}
    onClose={() => (formOpen = false)}
  />
{:else}
  <TransactionForm
    open={formOpen}
    tx={editTx}
    {draft}
    {link}
    title={link ? (draft?.type === "income" ? "Marcar como recibido" : "Marcar como pagado") : undefined}
    onClose={() => (formOpen = false)}
  />
{/if}

<MovementForm open={mvOpen} saving={mvSaving} movement={mvEdit} draft={mvDraft} title={mvTitle} onClose={() => (mvOpen = false)} />

<style>
  .rm-pick-note {
    margin: 0 0 var(--sp-8);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .rm-pick {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;

    & li {
      display: flex;
      align-items: center;
      gap: var(--sp-12);
      padding: var(--sp-10) 0;
    }

    & li + li {
      border-top: var(--border-width) solid var(--border);
    }

    & .rm-text {
      flex: 1;
      min-width: 0;
    }

    /* En el teléfono no caben en una fila: el nombre arriba, el monto y el botón debajo. */
    @media (max-width: 30rem) {
      & li {
        flex-wrap: wrap;
        gap: var(--sp-6) var(--sp-12);
      }

      & .rm-text {
        flex-basis: 100%;
      }

      & .rm-amount {
        flex: 1;
      }
    }
  }

  .rm {
    display: grid;
    gap: var(--sp-12);
  }

  /* El título y el mes van fuera de las tarjetas; cada grupo, en la suya. */
  .rm-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-12);
    margin-top: var(--sp-16);
  }

  .rm-heading {
    flex: 1 1 15rem;
    min-width: 0;

    & h2 {
      margin: 0 0 var(--sp-4);
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    & .card-sub {
      margin: 0;
    }
  }

  .rm-head {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--sp-4);
    margin-left: auto;

    & .card-sub {
      margin: 0;
      text-align: right;
    }
  }

  .rm-head-m {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0 var(--sp-4);
  }

  .rm-bar {
    height: 4px;
    margin: var(--sp-4) var(--sp-8) var(--sp-8);
    border-radius: 999px;
    background: var(--bg-field);
    overflow: hidden;

    & span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--success);
      transition: width 0.3s ease;
    }
  }

  .rm-group {
    min-width: 0;
    padding: var(--sp-8);
    transition: opacity 0.2s;

    &.loading {
      opacity: 0.7;
    }
  }

  /* El título del grupo a la izquierda; cuántos van y lo que falta, a la derecha. */
  .rm-group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-4) var(--sp-12);
    padding: var(--sp-6) var(--sp-8);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .rm-group-title {
    margin: 0;
    font-size: inherit;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .rm-group-sum {
    margin-left: auto;
  }

  .rm-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rm-row {
    display: flex;
    align-items: center;
    gap: var(--sp-4);

    & + .rm-row {
      border-top: var(--border-width) solid var(--border);
    }

    &.done .rm-name {
      color: var(--text-secondary);
    }
  }

  .rm-check {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
      color: var(--success);
    }

    &.on {
      color: var(--success);
    }

    &:disabled {
      opacity: 0.5;
      cursor: progress;
    }
  }

  .rm-main {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-10);
    min-width: 0;
    padding: var(--sp-8) var(--sp-4);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }
  }

  .rm-text {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .rm-name {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rm-sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .rm-late {
    color: var(--danger);
  }

  .rm-today {
    color: var(--warning);
    font-weight: 600;
  }

  .rm-amount {
    flex: none;
    font-weight: 600;
  }

  .rm-behind {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-6) var(--sp-10);
    margin: 0 var(--sp-8) var(--sp-8) 2.75rem;
    padding: var(--sp-8) var(--sp-10);
    border-radius: var(--radius-sm);
    background: color-mix(in oklch, var(--danger) 10%, transparent);
    color: var(--danger);
    font-size: var(--text-xs);

    & > span {
      flex: 1;
      min-width: 12rem;
    }
  }

  .rm-empty {
    margin: 0;
    padding: var(--sp-16);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
