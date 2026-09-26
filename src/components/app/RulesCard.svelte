<!--
  Las reglas del usuario en Ajustes: la lista, crear y editar, y aplicarlas
  todas de una vez a lo que ya está importado.
-->
<script lang="ts">
  import { money } from "../../lib/format";
  import { notify } from "../../lib/notify.svelte";
  import { tintFor } from "../../lib/palettes";
  import { pb } from "../../lib/pb.svelte";
  import { store, touchTransactions } from "../../lib/store.svelte";
  import type { Rule } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button } from "../ui";
  import Tag, { type Tone } from "../ui/Tag.svelte";
  import RuleForm from "./RuleForm.svelte";

  /** Cómo se ve cada tipo de regla: su ícono y su color. */
  const KIND: Record<string, { label: string; icon: string; tone: string }> = {
    expense: { label: "Gasto", icon: "money-send-01", tone: "k-expense" },
    income: { label: "Ingreso", icon: "money-receive-01", tone: "k-income" },
    transfer: { label: "Transferencia", icon: "arrow-data-transfer-horizontal", tone: "k-transfer" },
    discard: { label: "Descarta", icon: "delete-02", tone: "k-discard" },
  };

  let { initialMatch = "" }: { initialMatch?: string } = $props();

  let rules = $state<Rule[]>([]);
  let editing = $state<Rule | null>(null);
  let formOpen = $state(false);
  let prefill = $state("");
  let applying = $state(false);

  async function load() {
    try {
      rules = await pb.collection("rules").getFullList<Rule>({ sort: "name,match" });
    } catch (err) {
      notify.fail(err);
    }
  }

  $effect(() => {
    void load();
  });

  // Llegar con ?regla=TEXTO (desde un movimiento) abre la regla nueva ya escrita.
  $effect(() => {
    if (!initialMatch) return;
    prefill = initialMatch;
    editing = null;
    formOpen = true;
  });

  function openRule(r: Rule | null) {
    prefill = "";
    editing = r;
    formOpen = true;
  }

  async function applyAll() {
    applying = true;
    try {
      const r = await pb.send<{ changed: number }>("/api/finanzas/rules/apply", { method: "POST", body: {} });
      if (r.changed) touchTransactions();
      notify.done(r.changed ? `${r.changed} ${r.changed === 1 ? "movimiento actualizado" : "movimientos actualizados"}` : "Todo estaba al día");
    } catch (err) {
      notify.fail(err);
    } finally {
      applying = false;
    }
  }
</script>

<div class="card">
  <div class="card-head">
    <div>
      <h3 class="card-title">Reglas</h3>
      <p class="card-sub">
        Cada regla es una plantilla: los correos que cumplen su condición se vuelven movimientos solos, con el tipo, la cuenta, la
        categoría y la descripción que indica. Lo más fácil es crearlas desde un correo en <a class="link" href="#/correos">Correos</a>.
      </p>
    </div>
    <div class="card-head-actions">
      {#if rules.some((r) => !r.paused)}
        <Button size="sm" variant="ghost" loading={applying} onclick={applyAll}><Icon name="repeat" />Aplicar a todo</Button>
      {/if}
      <Button size="sm" onclick={() => openRule(null)}><Icon name="add-01" />Nueva</Button>
    </div>
  </div>
  <div class="card-body">
    {#if rules.length}
      <ul class="rule-list">
        {#each rules as r (r.id)}
          {@const cat = store.category(r.category)}
          {@const acc = store.account(r.account)}
          {@const to = store.account(r.to_account)}
          {@const kind = KIND[r.type || "expense"] ?? KIND.expense}
          <li>
            <button type="button" class="rule-item" class:paused={r.paused} onclick={() => openRule(r)}>
              <span class="rule-icon {kind.tone}" data-tip={kind.label}><Icon name={kind.icon} size={16} /></span>
              <span class="rule-main">
                <span class="rule-top">
                  {#if r.name.trim()}<b class="rule-name">{r.name}</b>{:else}<b class="rule-name unnamed">Sin nombre</b>{/if}
                  {#if r.paused}<Tag tone="off">En pausa</Tag>{/if}
                </span>
                <span class="rule-cond">
                  {#if r.sender}<span class="cond"><i class="dot hl-sender"></i>De <b>{r.sender}</b></span>{/if}
                  {#if r.match}<span class="cond"><i class="dot hl-rule"></i>Contiene <b>{r.match}</b></span>{/if}
                  {#if r.amount}<span class="cond"><i class="dot hl-amount"></i>Valor <b>{money(r.amount)}</b></span>{/if}
                </span>
                <span class="rule-result">
                  {#if r.type === "discard"}
                    <span>Descarta el correo</span>
                  {:else}
                    <span class="rule-type">{kind.label}</span>
                    {#if acc}<span>{acc.name}{#if to} → {to.name}{/if}</span>{/if}
                    {#if cat}<span>{cat.name}</span>{/if}
                    {#if r.description && r.description !== r.name}<span>«{r.description}»</span>{/if}
                    {#each r.tags ?? [] as t (t)}<Tag tone={tintFor(t) as Tone}>#{t}</Tag>{/each}
                  {/if}
                </span>
              </span>
              <Icon name="arrow-right-01" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small empty">
        Todavía no hay reglas. Ejemplo: si el correo viene de <b>alertas@banco.com</b> y dice <b>GOU PAYMENTS</b>, que sea un gasto de
        <b>Administración {"{mes}"}</b> en la cuenta de ahorros, categoría Vivienda. Ábrela desde un correo en Correos y ya viene llena.
      </p>
    {/if}
  </div>
</div>

<RuleForm open={formOpen} rule={editing} initialMatch={prefill} onClose={() => (formOpen = false)} onSaved={load} />

<style>
  .rule-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }
  }

  .rule-item {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    padding: var(--sp-12) var(--sp-8);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }

    &.paused .rule-icon,
    &.paused .rule-cond,
    &.paused .rule-result {
      opacity: 0.55;
    }
  }

  /* El tipo de la regla, en su color: como los montos de los movimientos. */
  .rule-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: color-mix(in oklch, var(--k) 16%, transparent);
    color: var(--k);

    &.k-expense {
      --k: var(--danger);
    }

    &.k-income {
      --k: var(--success);
    }

    &.k-transfer {
      --k: var(--accent);
    }

    &.k-discard {
      --k: var(--text-muted);
    }
  }

  .rule-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;
  }

  .rule-top {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
  }

  .rule-name.unnamed {
    color: var(--text-muted);
    font-style: italic;
  }

  .rule-name {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* La condición con los colores del formulario de la regla. */
  .rule-cond {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4) var(--sp-12);
    font-size: var(--text-xs);

    &:empty {
      display: none;
    }
  }

  .cond {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-6);
    min-width: 0;
    max-width: 100%;

    & b {
      overflow: hidden;
      color: var(--text-secondary);
      font-weight: 500;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  .hl-sender {
    background: oklch(0.88 0.08 320);
  }

  .hl-rule {
    background: oklch(0.9 0.1 150);
  }

  .hl-amount {
    background: oklch(0.92 0.11 90);
  }

  .rule-result {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4) var(--sp-6);
    font-size: var(--text-xs);

    & > span:not(:global(.tag)) + span:not(:global(.tag))::before {
      content: "·";
      margin-right: var(--sp-6);
      color: var(--text-muted);
    }
  }

  .rule-type {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .empty {
    margin: 0;
  }
</style>
