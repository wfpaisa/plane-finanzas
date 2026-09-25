/**
 * Rutas por hash (`#/movimientos?cuenta=abc`): PocketBase sirve la web como
 * archivos estáticos y así cualquier recarga cae en `index.html`.
 */

function read() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs) };
}

let current = $state(read());

window.addEventListener("hashchange", () => {
  current = read();
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
