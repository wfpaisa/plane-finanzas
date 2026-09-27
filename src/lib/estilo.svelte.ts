/**
 * El estilo de la app, elegido en Ajustes:
 *
 * - `bruma`: el de siempre. Lienzo con degradado, vidrio y almohadas.
 * - `solido`: fondo liso y vidrio sin brillos ni degradados, sombras suaves y
 *   el tinte elegido como color de acento vivo (ver `styles/solido.css`).
 *
 * Es de cada navegador (en el teléfono se puede probar uno y en el escritorio
 * otro) y va en `<html data-estilo>`. El guion de `index.html` lo pone antes de
 * pintar, para que no parpadee.
 */
export type Estilo = "bruma" | "solido";

const KEY = "finanzas-estilo";

function read(): Estilo {
  try {
    return localStorage.getItem(KEY) === "solido" ? "solido" : "bruma";
  } catch {
    return "bruma";
  }
}

let chosen = $state<Estilo>(read());

function apply(next: Estilo) {
  const root = document.documentElement;
  if (next === "solido") root.dataset.estilo = "solido";
  else delete root.dataset.estilo;
}

apply(chosen);

export const estilo = {
  get value(): Estilo {
    return chosen;
  },
  set(next: Estilo) {
    chosen = next;
    apply(next);
    try {
      if (next === "solido") localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // Sin almacenamiento vale para esta pestaña.
    }
  },
};
