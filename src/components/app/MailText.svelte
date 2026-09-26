<!--
  El texto de un correo, en fondo blanco como un correo de verdad, con sus
  negritas y enlaces (si llegó en HTML) y lo que se leyó resaltado: el valor,
  el comercio y el texto de la regla. Arriba, la leyenda con solo las marcas
  que aparecen. Nada del correo entra como HTML a la página: ver
  lib/highlight.ts. Si está el HTML original, se muestra ese, aislado (ver
  MailHtml.svelte).
-->
<script lang="ts">
  import { highlight, highlightRich, linkify, type Mark, type Piece } from "../../lib/highlight";
  import MailHtml from "./MailHtml.svelte";

  let {
    text,
    rich = "",
    html = "",
    amount = 0,
    merchant = "",
    keys = "",
    maxHeight = "16rem",
    legend = true,
    framed = true,
    images = $bindable(false),
  }: {
    text: string;
    /** El texto con negritas y enlaces; si no hay, se usa `text`. */
    rich?: string;
    /** El HTML original; si está, se muestra en vez del texto. */
    html?: string;
    amount?: number;
    merchant?: string;
    /** Los textos de la regla, separados por coma. */
    keys?: string;
    maxHeight?: string;
    /** Arriba, qué significa cada color. */
    legend?: boolean;
    /** Con borde propio; sin él, para ir dentro de otro marco. */
    framed?: boolean;
    /** Si se pasa (con bind), las imágenes se controlan desde afuera. */
    images?: boolean;
  } = $props();

  const LABEL: Record<Mark, string> = { rule: "Texto de la regla", amount: "Valor", merchant: "Comercio" };

  const pieces = $derived(linkify(rich ? highlightRich(rich, { amount, merchant, keys }) : highlight(text, { amount, merchant, keys })));
  let inHtml = $state<Mark[]>([]);
  const present = $derived(
    (["rule", "amount", "merchant"] as Mark[]).filter((m) => (html ? inHtml.includes(m) : pieces.some((p) => p.mark === m))),
  );
</script>

<div class="mail-text">
  {#if legend && present.length}
    <div class="mail-legend">
      {#each present as m (m)}<span class="mail-key"><mark class="m-{m}">{LABEL[m]}</mark></span>{/each}
    </div>
  {/if}
  {#if html}
    <MailHtml {html} {amount} {merchant} {keys} {maxHeight} {framed} bind:images toggle={framed} bind:present={inHtml} />
  {:else}
    <pre class="mail-paper" class:bare={!framed} style:max-height={maxHeight}>{#each pieces as p, i (i)}{#if p.href}<a href={p.href} target="_blank" rel="noopener noreferrer nofollow">{@render piece(p)}</a>{:else}{@render piece(p)}{/if}{/each}</pre>
  {/if}
</div>

{#snippet piece(p: Piece)}{#if p.mark}<mark class="m-{p.mark}" class:bold={p.bold}>{p.text}</mark>{:else if p.bold}<b>{p.text}</b>{:else}{p.text}{/if}{/snippet}

<style>
  .mail-text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .mail-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
    font-size: var(--text-xs);
  }

  /* Papel blanco en los dos temas: el correo se lee como llegó. */
  .mail-paper {
    margin: 0;
    padding: var(--sp-14) var(--sp-16);
    overflow: auto;
    border: 1px solid oklch(0.88 0 0);
    border-radius: var(--radius-md);
    background: oklch(1 0 0);
    color: oklch(0.28 0.01 250);
    font-family: inherit;
    font-size: var(--text-sm);
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  mark {
    padding: 0.05em 0.2em;
    border-radius: 0.25em;
    color: oklch(0.22 0.02 250);
    font-weight: 600;
    box-decoration-break: clone;
  }

  .mail-paper.bare {
    border: 0;
    border-radius: 0;
  }

  .mail-paper b,
  mark.bold {
    font-weight: 700;
  }

  .mail-paper a {
    color: oklch(0.48 0.18 260);
    text-decoration: underline;
    text-underline-offset: 0.15em;

    &:hover {
      color: oklch(0.4 0.2 260);
    }
  }

  .mail-legend mark {
    font-weight: 500;
  }

  .m-rule {
    background: oklch(0.9 0.1 150);
  }

  .m-amount {
    background: oklch(0.92 0.11 90);
  }

  .m-merchant {
    background: oklch(0.9 0.06 250);
  }
</style>
