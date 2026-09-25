<!--
  Un posible repetido (ver pb_hooks/lib/dupes.js): los dos lado a lado y la
  decisión de la persona, unirlos o dejarlos como distintos.
-->
<script lang="ts">
  import { dateShort } from "../../lib/format";
  import { dupeSide } from "../../lib/labels";
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { Transaction } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import Money from "./Money.svelte";

  let { tx, twin }: { tx: Transaction; twin: Transaction } = $props();

  let busy = $state(false);

  // Primero lo anotado a mano o la transferencia: es lo que queda al unir.
  const pair = $derived.by(() => {
    const first = (t: Transaction) => t.source === "manual" || !t.source || (t.type === "transfer" && twin.source !== "manual" && tx.source !== "manual");
    return first(twin) && !first(tx) ? [twin, tx] : [tx, twin];
  });

  function where(t: Transaction) {
    const acc = store.account(t.account)?.name ?? "";
    return t.type === "transfer" ? `${acc} → ${store.account(t.to_account)?.name ?? "?"}` : acc;
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    busy = true;
    try {
      await fn();
      touchTransactions();
      notify.done(done);
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  const merge = () => run(() => pb.send("/api/finanzas/tx/merge", { method: "POST", body: { id: tx.id } }), "Listo: quedó uno solo");
  const distinct = () => run(() => pb.collection("transactions").update(tx.id, { dup_of: "" }), "Quedan los dos");
</script>

<section class="dupe card" aria-label="Posible movimiento repetido">
  <div class="dupe-head">
    <Icon name="copy-01" size={16} />
    <strong>¿Es el mismo movimiento?</strong>
    <Money value={tx.amount} tone={tx.type === "transfer" ? undefined : tx.type} />
  </div>
  <div class="dupe-pair">
    {#each pair as t, i (t.id)}
      <div>
        <span class="dupe-label">{dupeSide(t)}{i === 0 ? " · queda este" : ""}</span>
        <span class="dupe-desc">{t.description || store.category(t.category)?.name || "Sin descripción"}</span>
        <span class="dupe-sub">{dateShort(t.date.slice(0, 10))} · {where(t)}</span>
      </div>
    {/each}
  </div>
  <div class="dupe-foot">
    <button type="button" class="btn sm" disabled={busy} onclick={distinct}>Son distintos</button>
    <button type="button" class="btn sm btn-primary" disabled={busy} onclick={merge}>
      <Icon name="git-merge" />Es el mismo: unir
    </button>
  </div>
</section>

<style>
  .dupe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-10);
    padding: var(--sp-12) var(--sp-16);
    border-color: color-mix(in oklch, var(--warning, var(--accent)) 45%, var(--border));
  }

  .dupe-head {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    font-size: var(--text-sm);
    color: var(--warning, var(--accent));

    & strong {
      color: var(--text-primary);
    }

    & :global(.money) {
      margin-left: auto;
      font-weight: 600;
    }
  }

  .dupe-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-10);

    & > div {
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: var(--sp-8) var(--sp-10);
      border-radius: var(--radius-md);
      background: var(--bg-field);
    }
  }

  .dupe-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .dupe-desc {
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dupe-sub {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .dupe-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-8);
  }
</style>
