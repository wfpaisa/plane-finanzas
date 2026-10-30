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

type Route = ReturnType<typeof read>;

/**
 * Una dirección que en realidad lleva a otra: en el celular, las pantallas de
 * escritorio abren su equivalente de la app del teléfono (ver `App.svelte`).
 * Devuelve el hash nuevo, o nada si la dirección se queda como está.
 */
let rewrite: ((r: Route) => string | undefined) | null = null;

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

/** Lo que cambia de pantalla en la ruta del celular; el resto son filtros. */
const SCREEN = ["ver", "categoria", "etiqueta"];

let lastHash = location.hash;

window.addEventListener("hashchange", () => {
  // Se reemplaza la entrada del historial sin otro `hashchange`: atrás no
  // pasa por la dirección de escritorio.
  const to = rewrite?.(read());
  if (to) history.replaceState(history.state, "", to);
  lastHash = location.hash;
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
  const moved = now.path !== current.path || SCREEN.some((k) => now.query.get(k) !== current.query.get(k));
  if (moved) transition(() => (current = now), direction);
  else current = now;
});

/** Vuelve a la pantalla de antes; si se entró directo a esta, va a `fallback`. */
export function goBack(fallback: string) {
  if (at > 0) history.back();
  else {
    hint = "atras";
    location.replace(fallback);
  }
}

// --- Capas -----------------------------------------------------------------
// Una hoja, un selector o una pantalla que se abre encima sin cambiar de ruta
// deja su propia entrada en el historial (misma dirección, marcada `capa`):
// el botón de atrás del teléfono la cierra en vez de salir de la pantalla.

type Layer = { at: number; close: () => void };
const layers: Layer[] = [];
/** Un `history.back()` propio en camino: lo que se abra mientras, espera. */
let backing = false;
const waiting: (() => void)[] = [];

function push(layer: Layer) {
  layer.at = ++next;
  at = layer.at;
  history.pushState({ ...history.state, at: layer.at, capa: true }, "");
}

/**
 * Abre una capa que el botón de atrás cierra con `close`. Devuelve con qué
 * quitarla cuando se cierra desde la app (su botón, al guardar…).
 */
export function closeOnBack(close: () => void) {
  const layer: Layer = { at: -1, close };
  layers.push(layer);
  const run = () => layers.includes(layer) && push(layer);
  if (backing) waiting.push(run);
  else run();
  return () => {
    const i = layers.indexOf(layer);
    if (i < 0) return; // ya la cerró el botón de atrás
    layers.splice(i, 1);
    // Si hay otra encima (o ya se va hacia atrás), su entrada se salta al pasar.
    if (!backing && layer.at >= 0 && history.state?.at === layer.at) {
      backing = true;
      history.back();
    }
  };
}

window.addEventListener("popstate", () => {
  const pos: number = history.state?.at ?? 0;
  // Con la misma dirección no hay `hashchange`: la posición se lleva aquí.
  if (location.hash === lastHash) at = pos;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].at > pos) layers.splice(i, 1)[0].close();
  }
  // Una capa que ya se cerró desde la app (o de la que se salió por un
  // enlace) no es una parada: se sigue de largo.
  if (history.state?.capa && !layers.some((l) => l.at === pos)) {
    backing = true;
    history.back();
    return;
  }
  backing = false;
  for (const run of waiting.splice(0)) run();
});

// Recargar con una capa abierta la cierra: su entrada ya no lleva a nada.
if (history.state?.capa) history.back();

/** Pone la regla de `rewrite` y la aplica ya a la dirección con la que se abrió. */
export function rewriteRoutes(fn: (r: Route) => string | undefined) {
  rewrite = fn;
  const to = fn(current);
  if (!to) return;
  history.replaceState(history.state, "", to);
  lastHash = location.hash;
  current = read();
}

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
