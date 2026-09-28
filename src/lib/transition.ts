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

// TEMPORAL: apagadas para probar si la animación es lo que frena el menú.
const DISABLED = true;

/** La transición en curso, si hay una, y cómo anular su cambio pendiente. */
let running: { vt: ViewTransition; cancel: () => void } | null = null;

export function transition(update: () => void, direction: Direction = "lado") {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (DISABLED || !("startViewTransition" in document) || reduce) {
    update();
    return;
  }
  // Quien pasa rápido por varias pantallas no espera animaciones: la que va
  // se corta y esta se aplica de una. Encadenar otra obligaría a esperar la
  // foto de antes y la animación entera en cada paso.
  if (running) {
    // Cortada antes de tomar la foto, el navegador corre su cambio después
    // de todos modos: se anula para que no pise al de ahora.
    running.cancel();
    running.vt.skipTransition();
    update();
    return;
  }
  const html = document.documentElement;
  html.dataset.vt = direction;
  // `flushSync` pinta la pantalla nueva dentro del callback: es cuando el
  // navegador toma la foto de después.
  let cancelled = false;
  const vt = document.startViewTransition(() => {
    if (cancelled) return;
    update();
    flushSync();
  });
  const mine = { vt, cancel: () => (cancelled = true) };
  running = mine;
  // Si se salta (otra transición la interrumpe, la pestaña está oculta),
  // el cambio igual se aplica; no es un error.
  vt.ready.catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      if (running !== mine) return;
      running = null;
      delete html.dataset.vt;
    });
}
