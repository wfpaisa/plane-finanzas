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

  let { initialMatch = "" }: { initialMatch?: string } = $props();

  let rules = $state<Rule[]>([]);
  let editing = $state<Rule | null>(null);
  let formOpen = $state(false);
  let prefill = $state("");
  let applying = $state(false);

  async function load() {
    try {
      rules = await pb.collection("rules").getFullList<Rule>({ sort: "match" });
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
        Las reglas asignan una categoría, etiquetas y una descripción cuando un movimiento importado de Gmail contiene el texto indicado.
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
          <li>
            <button type="button" class="rule-item" class:paused={r.paused} onclick={() => openRule(r)}>
              <span class="rule-match">{r.match}</span>
              {#if r.amount}<span class="rule-amount">{money(r.amount)}</span>{/if}
              <Icon name="arrow-right-02" size={14} />
              <span class="rule-result">
                {#if r.description}<b>{r.description}</b>{/if}
                {#if cat}<span class="muted">{cat.name}</span>{/if}
                {#each r.tags ?? [] as t (t)}<Tag tone={tintFor(t) as Tone}>#{t}</Tag>{/each}
                {#if r.paused}<span class="muted small">en pausa</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small empty">
        Todavía no hay reglas. Ejemplo: si dice <b>GOU PAYMENTS</b>, que sea <b>Administración {"{mes}"}</b>, categoría Vivienda y etiqueta
        #administración. También puedes crearla desde un movimiento.
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
    gap: var(--sp-10);
    width: 100%;
    padding: var(--sp-10) var(--sp-4);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }

    &.paused {
      opacity: 0.55;
    }
  }

  .rule-match {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .rule-amount {
    flex: none;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-xs);
  }

  .rule-result {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4) var(--sp-8);
    min-width: 0;

    & b {
      color: var(--text-primary);
      font-weight: 600;
    }
  }

  .empty {
    margin: 0;
  }
</style>
