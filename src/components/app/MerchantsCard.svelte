<!--
  Los comercios en Ajustes → Gmail: el nombre limpio con que se registran las
  compras ("IKEA ENVIGADO" -> "Ikea") y, si se quiere, su categoría. Así una
  sola regla de compras con {comercio} sirve para todos. Ver
  pb_hooks/lib/merchants.js.
-->
<script lang="ts">
  import { notify } from "../../lib/notify.svelte";
  import { pb } from "../../lib/pb.svelte";
  import { store } from "../../lib/store.svelte";
  import type { Merchant } from "../../lib/types";
  import Icon from "../Icon.svelte";
  import { Button } from "../ui";
  import MerchantForm from "./MerchantForm.svelte";

  let merchants = $state<Merchant[]>([]);
  let query = $state("");
  let editing = $state<Merchant | null>(null);
  let formOpen = $state(false);

  async function load() {
    try {
      merchants = await pb.collection("merchants").getFullList<Merchant>({ sort: "name" });
    } catch (err) {
      notify.fail(err);
    }
  }

  $effect(() => {
    void load();
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? merchants.filter((m) => `${m.name} ${m.match}`.toLowerCase().includes(q)) : merchants;
  });

  function open(m: Merchant | null) {
    editing = m;
    formOpen = true;
  }
</script>

<div class="card">
  <div class="card-head">
    <div>
      <h3 class="card-title">Comercios</h3>
      <p class="card-sub">
        El nombre con que quieres ver cada comercio en tus movimientos y, si quieres, su categoría. Por ejemplo, «IKEA ENVIGADO» se registra
        como «Ikea». Lo más fácil es nombrarlos desde un correo en <a class="link" href="#/correos">Correos</a>.
      </p>
    </div>
    <div class="card-head-actions">
      <Button size="sm" onclick={() => open(null)}><Icon name="add-01" />Nuevo comercio</Button>
    </div>
  </div>
  <div class="card-body stack">
    {#if merchants.length > 8}
      <input class="field-control sm merchant-search" type="search" placeholder="Buscar comercio" bind:value={query} aria-label="Buscar comercio" />
    {/if}
    {#if shown.length}
      <ul class="merchant-list">
        {#each shown as m (m.id)}
          {@const cat = store.category(m.category)}
          <li>
            <button type="button" class="merchant-item" onclick={() => open(m)}>
              <span class="merchant-main">
                <b>{m.name}</b>
                <span class="muted small">Si el comercio contiene <b>{m.match}</b>{#if cat} · {cat.name}{/if}</span>
              </span>
              <Icon name="arrow-right-01" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    {:else if merchants.length}
      <p class="muted small empty">Ningún comercio coincide con la búsqueda.</p>
    {:else}
      <p class="muted small empty">
        Aún no has nombrado comercios. Los movimientos llevan el nombre que trae el correo, como «DOLLARCITY SABANETA». Abre un correo en Correos y
        elige «Nombrar comercio» para que se registre como «Dollarcity».
      </p>
    {/if}
    <p class="small muted">
      En la descripción de una regla, <b>{"{comercio}"}</b> pone este nombre tal como lo escribiste. Para los comercios sin nombre, puedes limpiar el
      del correo con filtros: <b>{"{comercio|sin_ciudad|capitalizar}"}</b> convierte «IKEA ENVIGADO» en «Ikea». Los filtros no cambian los nombres
      que escribiste aquí.
    </p>
  </div>
</div>

<MerchantForm open={formOpen} merchant={editing} onClose={() => (formOpen = false)} onSaved={load} />

<style>
  .merchant-search {
    width: min(100%, 16rem);
  }

  .merchant-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;

    & li + li {
      border-top: 1px solid var(--border);
    }
  }

  .merchant-item {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    padding: var(--sp-10) var(--sp-8);
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
  }

  .merchant-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
    color: var(--text-primary);
  }

  .empty {
    margin: 0;
  }
</style>
