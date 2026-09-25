/**
 * El tinte del fondo de toda la app: lo elige cada quien en Ajustes y se
 * guarda en este navegador, igual que el modo claro/oscuro.
 *
 * Va en `<html data-tint>` como `--tint-h` (el tono) y `--tint-k` (cuánto
 * color: un gris no tiñe, un color vivo tiñe un poco más que la bruma);
 * `glass.css` los usa en el lienzo, el vidrio, las líneas y el texto. Sin
 * tinte (`null`) queda la bruma de partida. El mismo cálculo lo hace el guion de `index.html` antes de
 * pintar, para que no parpadee.
 */
import { isHex, oklchOf } from "./palettes";

const KEY = "finanzas-tinte";

function saved(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return isHex(v) ? v : null;
  } catch {
    return null;
  }
}

let chosen = $state<string | null>(saved());

/* Se aplica al momento: las gráficas se redibujan por el cambio de `chosen`
   y leen ya los colores nuevos. */
function apply(color: string | null) {
  const root = document.documentElement;
  if (color) {
    const { h, c } = oklchOf(color);
    root.dataset.tint = "";
    root.style.setProperty("--tint-h", h.toFixed(1));
    root.style.setProperty("--tint-k", Math.min(1.4, c / 0.1).toFixed(2));
  } else {
    delete root.dataset.tint;
    root.style.removeProperty("--tint-h");
    root.style.removeProperty("--tint-k");
  }
}

apply(chosen);

export const tint = {
  get value(): string | null {
    return chosen;
  },
  set(next: string | null) {
    apply(next);
    chosen = next;
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Sin almacenamiento se queda para esta pestaña.
    }
  },
};
