/**
 * El HTML de un correo, para verlo como llegó sin que entre nada peligroso:
 * DOMPurify quita scripts, eventos y formularios, y el documento lleva una
 * CSP que no deja cargar nada de afuera (las imágenes remotas suelen ser
 * píxeles de rastreo; se cargan solo si la persona lo pide). Se muestra en un
 * iframe con sandbox y sin scripts (ver MailHtml.svelte).
 */
import DOMPurify from "dompurify";

import { highlight, type Mark } from "./highlight";

const REMOTE = /\b(?:src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i;

/** Si el correo trae imágenes o fondos de afuera. */
export const hasRemote = (html: string) => REMOTE.test(html);

/** Estilos propios: las marcas y que nada se salga del ancho. */
const OWN_CSS = `
  html { color-scheme: light; }
  body { margin: 0; padding: 14px 16px; background: #fff; color: #333; font: 14px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  mark { padding: 0.05em 0.2em; border-radius: 0.25em; color: #1f2733; font-weight: 600; box-decoration-break: clone; }
  mark.m-rule { background: oklch(0.9 0.1 150); }
  mark.m-amount { background: oklch(0.92 0.11 90); }
  mark.m-merchant { background: oklch(0.9 0.06 250); }
`;

/** Los enlaces se abren fuera, sin decirle a la página de dónde vienen. */
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    } else node.removeAttribute("href");
  }
});

/** El documento listo para `srcdoc`. */
export function cleanMail(html: string, opts: { images?: boolean } = {}): string {
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["form", "input", "button", "select", "textarea", "iframe", "object", "embed", "base", "link", "meta"],
    FORBID_ATTR: ["srcset"],
  });
  // Muchos bancos aún sirven sus imágenes por http.
  const img = opts.images ? "data: cid: https: http:" : "data: cid:";
  const csp = `default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:`;
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>${OWN_CSS}</style>`;
  // Lo propio va primero: la CSP rige antes de que se lea el resto.
  return `<!doctype html>${clean.replace(/<head>/i, `<head>${head}`)}`;
}

/** Quita las marcas puestas por `markDom`. */
export function unmark(root: HTMLElement) {
  for (const m of root.querySelectorAll("mark[data-hl]")) m.replaceWith(...m.childNodes);
  root.normalize();
}

/**
 * Resalta sobre el documento lo que se leyó (como `highlight`, que trabaja
 * sobre el texto seguido de todos los nodos). Devuelve las marcas que quedaron.
 */
export function markDom(root: HTMLElement, opts: { amount?: number; merchant?: string; keys?: string }): Mark[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("style, title, script") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = "";
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    starts.push(full.length);
    nodes.push(t);
    full += t.data;
  }

  const ranges: { start: number; end: number; mark: Mark }[] = [];
  let pos = 0;
  for (const p of highlight(full, opts)) {
    if (p.mark) ranges.push({ start: pos, end: pos + p.text.length, mark: p.mark });
    pos += p.text.length;
  }

  // De atrás hacia adelante: así cada corte no mueve los que faltan.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const s = starts[i];
    const e = s + node.data.length;
    const hits = ranges.filter((r) => r.start < e && r.end > s).reverse();
    for (const r of hits) {
      const a = Math.max(r.start, s) - s;
      const b = Math.min(r.end, e) - s;
      if (!node.data.slice(a, b).trim()) continue;
      const range = doc.createRange();
      range.setStart(node, a);
      range.setEnd(node, b);
      const m = doc.createElement("mark");
      m.className = `m-${r.mark}`;
      m.dataset.hl = "";
      range.surroundContents(m);
    }
  }
  return [...new Set(ranges.map((r) => r.mark))];
}
