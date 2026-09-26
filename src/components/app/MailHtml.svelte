<!--
  El correo en HTML, como llegó, en un iframe aislado: sin scripts, sin
  formularios y sin cargar nada de afuera (ver lib/mailHtml.ts). Las
  imágenes remotas se cargan solo si se pide (con su propio enlace o, con
  `toggle={false}`, desde un botón de quien lo usa). Lo que se leyó se resalta
  encima, sin recargar el iframe cuando cambia.
-->
<script lang="ts">
  import type { Mark } from "../../lib/highlight";
  import { cleanMail, hasRemote, markDom, unmark } from "../../lib/mailHtml";

  let {
    html,
    amount = 0,
    merchant = "",
    keys = "",
    maxHeight = "16rem",
    framed = true,
    images = $bindable(false),
    toggle = true,
    present = $bindable([]),
  }: {
    html: string;
    amount?: number;
    merchant?: string;
    keys?: string;
    maxHeight?: string;
    /** Con borde propio; sin él, para ir dentro de otro marco. */
    framed?: boolean;
    /** Cargar las imágenes de afuera. */
    images?: boolean;
    /** Mostrar el enlace «Mostrar imágenes» debajo. */
    toggle?: boolean;
    /** Las marcas que quedaron en el correo, para la leyenda. */
    present?: Mark[];
  } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let body = $state<HTMLElement | null>(null);
  let height = $state(0);

  const remote = $derived(hasRemote(html));
  const doc = $derived(cleanMail(html, { images }));
  // Otro documento: las marcas se ponen de nuevo cuando cargue.
  $effect.pre(() => {
    void doc;
    body = null;
  });

  function onload() {
    const d = frame?.contentDocument;
    if (!d?.body) return;
    body = d.body;
    fit();
    // Las imágenes llegan después y cambian el alto.
    new ResizeObserver(fit).observe(d.documentElement);
  }

  function fit() {
    const d = frame?.contentDocument;
    if (d) height = d.documentElement.scrollHeight;
  }

  $effect(() => {
    const opts = { amount, merchant, keys };
    if (!body) return;
    unmark(body);
    present = markDom(body, opts);
  });
</script>

<div class="mail-html" class:bare={!framed} style:max-height={maxHeight}>
  <iframe
    bind:this={frame}
    title="Contenido del correo"
    srcdoc={doc}
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    referrerpolicy="no-referrer"
    style:height="{height}px"
    {onload}
  ></iframe>
</div>
{#if toggle && remote && !images}
  <button type="button" class="load-images" onclick={() => (images = true)}>Mostrar imágenes</button>
{/if}

<style>
  /* Papel blanco en los dos temas, como .mail-paper en MailText. */
  .mail-html {
    overflow: auto;
    border: 1px solid oklch(0.88 0 0);
    border-radius: var(--radius-md);
    background: oklch(1 0 0);
  }

  .mail-html.bare {
    border: 0;
    border-radius: 0;
  }

  iframe {
    display: block;
    width: 100%;
    min-height: 3rem;
    border: 0;
  }

  .load-images {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-xs);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;

    &:hover {
      color: var(--text-primary);
    }
  }
</style>
