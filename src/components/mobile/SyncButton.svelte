<!--
  El estado de la conexión en la barra de arriba: solo aparece cuando hay algo
  que contar (sin conexión, cambios por enviar o que el servidor rechazó) y al
  tocarlo abre la hoja con el detalle (ver routes/Mobile.svelte).
-->
<script lang="ts">
  import Icon from "../Icon.svelte";
  import { offline } from "../../lib/offline.svelte";
  import { syncSheet } from "../../lib/ui.svelte";

  const status = $derived.by(() => {
    const n = offline.pending;
    if (offline.authNeeded && n) return { icon: "alert-02", label: "Entra de nuevo para enviar", tone: "warn" };
    const f = offline.failed.length;
    if (f) return { icon: "alert-02", label: f === 1 ? "1 cambio sin guardar" : `${f} cambios sin guardar`, tone: "bad" };
    if (!offline.online) return { icon: "wifi-off-01", label: n ? `Sin conexión · ${n} por enviar` : "Sin conexión", tone: "" };
    if (n) return { icon: "cloud-upload", label: `Enviando ${n}…`, tone: "" };
    return null;
  });
  const count = $derived(offline.pending + offline.failed.length);
</script>

{#if status}
  <button
    type="button"
    class="btn-icon sm sb {status.tone}"
    aria-label={status.label}
    title={status.label}
    onclick={() => (syncSheet.open = true)}
  >
    <Icon name={status.icon} size={18} />
    {#if count}<span class="sb-count">{count}</span>{/if}
  </button>
{/if}

<style>
  .sb {
    position: relative;
    color: var(--text-secondary);

    &.warn {
      color: var(--warning, var(--danger));
    }

    &.bad {
      color: var(--danger);
    }
  }

  .sb-count {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 1rem;
    padding: 0 0.25rem;
    border-radius: var(--radius-pill, 99px);
    background: var(--accent);
    color: var(--accent-text);
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
  }
</style>
