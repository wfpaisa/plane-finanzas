<!--
  A dónde fue el dinero: lo que entró a la izquierda, el total en una barra
  al centro y a dónde fue a la derecha, cada banda del ancho de su monto.

  Las bandas y las barras son un SVG que se estira a lo ancho; las etiquetas
  son HTML encima, para que la letra no se deforme ni se encoja en el móvil.
-->
<script lang="ts">
  import { band, flowLayout, type FlowItem } from "../../lib/analysis";
  import { money } from "../../lib/format";
  import Money from "./Money.svelte";

  let {
    left,
    right,
    center,
    height = 300,
    active = "",
    onpick,
  }: {
    left: FlowItem[];
    right: FlowItem[];
    /** Lo que dice la barra del centro. */
    center: string;
    height?: number;
    /** El nodo de la derecha elegido: los demás se apagan. */
    active?: string;
    /** Tocar un nodo de la derecha. */
    onpick?: (id: string) => void;
  } = $props();

  const W = 1000;
  const NODE = 12;
  const MID = (W - NODE) / 2;

  const flow = $derived(flowLayout(left, right, height, 8, 30));
  const pctOf = (v: number) => (flow.total ? `${Math.round((v / flow.total) * 100)}%` : "");
</script>

<div class="flow" style:height="{height}px">
  <div class="flow-labels left">
    {#each flow.left as n (n.id)}
      <div class="flow-label" style:top="{((n.y + n.h / 2) / height) * 100}%">
        <span class="flow-name">{n.label}</span>
        <span class="flow-amount"><Money value={n.value} /></span>
      </div>
    {/each}
  </div>

  <div class="flow-graph">
    <svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" role="img" aria-label="De dónde vino y a dónde fue el dinero">
      {#each flow.left as n (n.id)}
        <path class="flow-band {n.tint}" d={band(NODE, n.y, n.h, MID, n.my, n.mh)}>
          <title>{n.label}: {money(n.value)}</title>
        </path>
        <rect class="flow-node {n.tint}" x="0" y={n.y} width={NODE} height={n.h} rx="3" />
      {/each}
      {#each flow.right as n (n.id)}
        {@const pickable = !!onpick && !n.id.startsWith("_")}
        <!-- Con el teclado se elige desde la etiqueta, que es un botón. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <g class:pickable onclick={() => pickable && onpick?.(n.id)}>
          <path class="flow-band {n.tint}" class:dim={active && active !== n.id} d={band(MID + NODE, n.my, n.mh, W - NODE, n.y, n.h)}>
            <title>{n.label}: {money(n.value)} ({pctOf(n.value)})</title>
          </path>
          <rect class="flow-node {n.tint}" class:dim={active && active !== n.id} x={W - NODE} y={n.y} width={NODE} height={n.h} rx="3" />
        </g>
      {/each}
      <rect class="flow-center" x={MID} y="0" width={NODE} height={height} rx="3" />
    </svg>
    <div class="flow-center-label">
      <span>{center}</span>
      <b><Money value={flow.total} /></b>
    </div>
  </div>

  <div class="flow-labels right">
    {#each flow.right as n (n.id)}
      <button
        type="button"
        class="flow-label"
        class:dim={active && active !== n.id}
        style:top="{((n.y + n.h / 2) / height) * 100}%"
        disabled={!onpick || n.id.startsWith("_")}
        onclick={() => onpick?.(n.id)}
      >
        <span class="flow-name">{n.label}</span>
        <span class="flow-amount"><Money value={n.value} /> <span class="flow-pct">{pctOf(n.value)}</span></span>
      </button>
    {/each}
  </div>
</div>

<style>
  .flow {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 4fr) minmax(0, 1fr);
    gap: var(--sp-10);

    @media (max-width: 40rem) {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.1fr);
      gap: var(--sp-6);
    }
  }

  .flow-labels {
    position: relative;

    &.left .flow-label {
      right: 0;
      align-items: flex-end;
      text-align: right;
    }

    &.right .flow-label {
      left: 0;
      align-items: flex-start;
      text-align: left;
    }
  }

  .flow-label {
    position: absolute;
    display: flex;
    flex-direction: column;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    transform: translateY(-50%);
    transition: opacity 0.2s;

    &:is(button):not(:disabled) {
      cursor: pointer;

      &:hover .flow-name {
        text-decoration: underline;
      }
    }

    &.dim {
      opacity: 0.4;
    }
  }

  .flow-name {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-amount {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .flow-pct {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-muted);
  }

  .flow-graph {
    position: relative;

    & svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  }

  .pickable {
    cursor: pointer;
  }

  .flow-node {
    fill: var(--tinte, var(--chart-1));
    transition: opacity 0.2s;
  }

  .flow-band {
    fill: var(--tinte, var(--chart-1));
    opacity: 0.28;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.5;
    }
  }

  .dim {
    opacity: 0.1;
  }

  .flow-node.dim {
    opacity: 0.3;
  }

  .flow-center {
    fill: var(--text-muted);
  }

  /* Los nodos que no son categorías: lo que sobró y lo que faltó. */
  .flow :global(.flow-saved) {
    --tinte: var(--success);
  }

  .flow :global(.flow-short) {
    --tinte: var(--danger);
  }

  .flow-center-label {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--sp-4) var(--sp-10);
    border-radius: 99rem;
    background: var(--glass-2, var(--bg-level2));
    box-shadow: 0 0 0 var(--border-width) var(--border);
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;

    & b {
      font-size: var(--text-sm);
      color: var(--text-primary);
    }
  }
</style>
