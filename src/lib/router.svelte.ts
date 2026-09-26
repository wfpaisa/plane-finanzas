/**
 * Rutas por hash (`#/movimientos?cuenta=abc`): PocketBase sirve la web como
 * archivos estáticos y así cualquier recarga cae en `index.html`.
 */

import { type Direction, transition } from "./transition";

function read() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs) };
}

let current = $state(read());

// Cada entrada del historial lleva su posición en `history.state`: si la
// nueva está antes que la actual, se volvió (botón atrás del teléfono o del
// navegador) y la pantalla se desliza al revés.
let at: number = history.state?.at ?? 0;
let next = at;
if (history.state?.at === undefined) history.replaceState({ ...history.state, at }, "");
let hint: Direction | null = null;

/** Cómo animar el próximo cambio de ruta, si no es el que se deduce. */
export function nextDirection(d: Direction) {
  hint = d;
}

window.addEventListener("hashchange", () => {
  let pos: number | undefined = history.state?.at;
  if (pos === undefined) {
    pos = ++next;
    history.replaceState({ ...history.state, at: pos }, "");
  }
  const direction = hint ?? (pos < at ? "atras" : "adelante");
  hint = null;
  at = pos;
  next = Math.max(next, pos);

  const now = read();
  // Solo se anima cambiar de pantalla: la ruta o la subpantalla del celular
  // (`?ver=`), no los filtros de la misma página.
  const moved = now.path !== current.path || now.query.get("ver") !== current.query.get("ver");
  if (moved) transition(() => (current = now), direction);
  else current = now;
});

export const route = {
  get path() {
    return current.path;
  },
  get query() {
    return current.query;
  },
};

export function go(path: string, query?: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) qs.set(k, v);
  const s = qs.toString();
  window.location.hash = `#${path}${s ? `?${s}` : ""}`;
}

export const href = (path: string, query?: Record<string, string | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) qs.set(k, v);
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ""}`;
};
