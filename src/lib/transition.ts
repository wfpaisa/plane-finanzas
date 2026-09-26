/**
 * El paso de una pantalla a otra con la View Transitions API: el navegador
 * toma una foto de antes, se aplica el cambio y anima hacia la de después.
 * Cómo se anima lo dice `styles/transitions.css`, según `html[data-vt]`.
 *
 * Donde no hay soporte, o la persona pidió menos movimiento, el cambio se
 * aplica sin más.
 */
import { flushSync } from "svelte";

/** Hacia dónde va: entrar a algo, volver de algo o cambiar de pestaña. */
export type Direction = "adelante" | "atras" | "lado";

let last = 0;

export function transition(update: () => void, direction: Direction = "lado") {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("startViewTransition" in document) || reduce) {
    update();
    return;
  }
  const html = document.documentElement;
  const mine = ++last;
  html.dataset.vt = direction;
  // `flushSync` pinta la pantalla nueva dentro del callback: es cuando el
  // navegador toma la foto de después.
  const vt = document.startViewTransition(() => {
    update();
    flushSync();
  });
  // Si se salta (otra transición la interrumpe, la pestaña está oculta),
  // el cambio igual se aplica; no es un error.
  vt.ready.catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      if (mine === last) delete html.dataset.vt;
    });
}
