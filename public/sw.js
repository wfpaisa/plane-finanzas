/**
 * El service worker: guarda la app (HTML, JS, CSS, íconos, fuentes) para que
 * abra sin internet. Los datos no pasan por aquí: esos van en IndexedDB
 * (src/lib/local.ts) y la API (/api) siempre va directo a la red.
 *
 * - La página: primero la red, y sin red la última guardada.
 * - /assets/*: llevan un hash en el nombre, así que nunca cambian: primero el
 *   caché. Al llegar una página nueva se borran los que ya no usa.
 * - Lo demás (íconos, fuentes de Google): lo guardado, y se actualiza por
 *   detrás.
 */

const CACHE = "finanzas-app";
const SHELL = ["/", "/manifest.webmanifest", "/iconos/iconos.css", "/iconos/iconos.woff2", "/pwa/icon-192.png"];

/** Los /assets/* que pide una página. */
function assetsOf(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
}

/** Guarda una página y lo que pide; borra los assets viejos. */
async function keepPage(res) {
  const cache = await caches.open(CACHE);
  const html = await res.clone().text();
  await cache.put("/", res.clone());
  const wanted = new Set(assetsOf(html));
  await Promise.all([...wanted].map((u) => cache.match(u).then((hit) => hit || cache.add(u))));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !wanted.has(path)) await cache.delete(req);
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL.slice(1));
      await keepPage(await fetch("/", { cache: "no-store" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  // La API y el panel de PocketBase, siempre en vivo.
  if (same && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_/"))) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) e.waitUntil(keepPage(res.clone()).catch(() => {}));
          return res;
        })
        .catch(async () => (await caches.match("/")) || Response.error()),
    );
    return;
  }

  const fonts = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";
  if (!same && !fonts) return;

  if (same && url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then(async (res) => {
            if (res.ok) await (await caches.open(CACHE)).put(req, res.clone());
            return res;
          }),
      ),
    );
    return;
  }

  // Lo guardado ya, y por detrás la versión nueva.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok || res.type === "opaque") cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      if (hit) {
        e.waitUntil(fresh.catch(() => {}));
        return hit;
      }
      return fresh;
    }),
  );
});
